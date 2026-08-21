# Task: Google Meet リンクの作成・削除

## Purpose

`gcal add --meet` / `gcal update --meet` でイベントに Google Meet 会議を紐付けられるようにする。
041（出席者招待）と組み合わせることで、「オンライン打ち合わせを作って招待する」が 1 コマンドで完結する。

Google Calendar API の `conferenceData.createRequest` + クエリパラメータ `conferenceDataVersion: 1` で実現でき、
**現行の OAuth スコープ `calendar.events` で作成可能なため再認証は不要**（`spec/auth.md` の変更なし）。

## Context

- Related files:
  - `src/lib/api.ts` — `GoogleCalendarApi`, `GoogleEventWriteBody`, `GoogleEvent`, `normalizeEvent()`, `createEvent()`, `updateEvent()`
  - `src/commands/shared.ts` — `createGoogleCalendarApi()`
  - `src/commands/add.ts` / `src/commands/update.ts`
  - `src/lib/output.ts` — `formatEventDetailText()`, `formatEventListText()`
  - `src/types/index.ts` — `CalendarEvent`
- Related specs: `spec/commands.md`, `spec/output.md`
- Dependencies: 041-attendees（`api.ts` の同じ型・パラメータを触るため後に積む）
- 参照: [Create events guide](https://developers.google.com/workspace/calendar/api/guides/create-events)

## Design Decisions

### `conferenceSolutionKey` は指定しない

`createRequest` に `conferenceSolutionKey.type` を明示すると、consumer アカウントと
Google Workspace アカウントで利用可能な会議方式が異なるため失敗しうる。
**`requestId` のみを渡してカレンダー既定の方式に任せる**（公式ガイドの例と同じ形）。

ただしこれは、既定が Meet 以外（クラシック Hangouts やサードパーティ会議アドオン）の
カレンダーでは **Meet 以外の会議が付く**ことを意味する。レビューでの指摘を受けて、
`--meet` という名前のフラグと `meet_link` というフィールドが Meet 以外の URL を返さないよう、
**レスポンスの `conferenceSolution.key.type` を見て判定する**方針を追加した:

- `hangoutsMeet` 以外と分かったら `meet_link` は `null` のままにする
- 実際に付いた会議は `conference: { type, uri }` として返し、URL を失わせない
- stderr で「Meet ではなく <type> が付いた」と知らせる
- 会議もイベントも実際に作られているため、終了コードは 0（成功）のまま

```ts
requestBody.conferenceData = { createRequest: { requestId } };
// params に conferenceDataVersion: 1 を付ける
```

### `requestId` は毎回ユニークに生成する

API ドキュメントが明示的に警告している通り、`requestId` を使い回すと**同じ会議 URL が複数イベントで
共有され、意図しない相手に会議情報が露出する**。`crypto.randomUUID()` で毎回新規生成する。

テストで決定的にするため、生成関数を DI する（プロジェクト既存の DI スタイルに合わせる）:

```ts
export interface CreateEventInput {
  // ...
  meet?: boolean;
}

export async function createEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  input: CreateEventInput,
  deps?: { generateRequestId?: () => string; sleep?: (ms: number) => Promise<void> },
): Promise<CalendarEvent>;
```

### 会議生成は非同期 — pending のリトライが必要

レスポンスの `conferenceData.createRequest.status.statusCode` は `pending` / `success` / `failure` を取る。
`pending` の間は `hangoutLink` / `entryPoints` がまだ空になりうる。

`api.ts` にリトライを実装する:

- `pending` なら `events.get` で再取得。**最大 3 回**、待機 500ms → 1s → 2s
- `success` になったら `meet_link` を埋めて返す
- 3 回試しても `pending` のままなら **`meet_link: null` のまま成功として返し、stderr に注記を出す**
  （イベント自体は作成済みなので失敗扱いにしない）

```
Note: Google Meet link is still being generated. Run `gcal show <id>` in a few seconds to get it.
```

- `failure` なら `API_ERROR` を投げ、`status.statusCode` の内容をメッセージに含める

`sleep` は DI してユニットテストで即時解決させる。

### `meet_link` の抽出

**当初は「`event.hangoutLink` を第一候補とし、無ければ `entryPoints[]` の `video` の `uri`」
という方針だったが、レビューで撤回した。** `hangoutLink` が Meet のときだけ設定されるという
前提が誤りで、実際には Meet より前からあるフィールドでクラシック Hangouts
（`eventHangout` / `eventNamedHangout`）でも設定される。この前提のままだと、Meet 以外の会議が
付いたイベントで `meet_link` に非 Meet の URL が入り、stderr の「Meet ではない」という
通知と矛盾していた。

判定は `conferenceData.conferenceSolution.key.type` だけで行う:

1. Meet 以外と分かっているなら `meet_link` は `null`
2. それ以外なら `hangoutLink`、無ければ `entryPoints[]` の `video` の `uri`

`src/types/index.ts` の `CalendarEvent` に `meet_link: string | null` と
`conference: EventConference | null` を追加する（フィールド追加のみで後方互換）。

### Meet の削除

`conferenceData: null` を `conferenceDataVersion: 1` 付きで `patch` する。

- `gcal update <id> --remove-meet`
- `--meet` と `--remove-meet` は conflict

### 既存イベントの conferenceData を壊さないこと

現行の `updateEvent()` は `patch` で**明示的に指定されたフィールドのみ**を送る実装なので、
`--meet` / `--remove-meet` を指定しない限り `conferenceData` はリクエストに載らず、既存の会議は保持される。
`conferenceDataVersion: 1` は **`--meet` / `--remove-meet` が指定されたときだけ**付ける。
この不変条件をユニットテストで固定する。

### 全日イベント

**当初は `--meet` と全日イベントの組み合わせを `INVALID_ARGS` で弾く方針だったが、実装後の
レビューで撤回した。** API も Google カレンダーの Web UI も全日イベントへの Meet 追加を許可しており、
CLI が独自に禁止する根拠がない。加えて `add` にしかガードが無く `update --meet` では素通りしていたため、
両コマンドの挙動が食い違っていた。制約自体を無くして揃えた（E2E で実 API が受け付けることを確認済み）。

### Text 出力

`formatEventDetailText()` の Link 行の前に追加する（存在するときのみ）:

```
Availability:  busy

Meet: https://meet.google.com/abc-defg-hij
Link: https://calendar.google.com/...
```

`gcal list` の行フォーマットは**変更しない**（041 と同じ方針）。

### 失敗時のエラーメッセージ

カレンダー側で会議が許可されていない場合、API は 400 を返す。`mapApiError()` の
`API_ERROR` にそのまま流すが、`--meet` 指定時の 400 にはヒントを添える。

**レビューでの指摘により文面を修正した。** 当初は「このカレンダーは会議の作成に対応していない
可能性がある」と原因を示唆していたが、`--meet` 付きのリクエストが 400 になる原因は会議とは限らない
（時刻範囲が不正な場合など）。原因を断定せず「`--meet` を外して再実行する」選択肢を示す文面にした。

`createRequest.status` が `failure` のときは `API_ERROR` を投げるが、**その時点でイベントは
既に作成/更新済み**である。エラーメッセージにイベント ID を含めないとユーザーが後始末できないため、
ID を含める。

### Out of Scope

- Zoom 等サードパーティ会議（`conferenceSolutionKey` の明示指定・アドオン連携）
- `calendarList.conferenceProperties.allowedConferenceSolutionTypes` による事前チェック
  （API 呼び出しが 1 回増えるため、エラーを握って案内する方針とする）
- 電話番号などの `entryPoints` の全表示（video のみ扱う）

## Changes

### `gcal add`

```bash
gcal add -t "Design review" -s "2026-09-01T10:00" --meet
gcal add -t "1on1" -s "2026-09-01T10:00" --meet -a alice@example.com --notify all
```

```
--meet   Google Meet 会議を作成して紐付ける
```

### `gcal update`

```bash
gcal update abc123 --meet          # Meet を追加
gcal update abc123 --remove-meet   # Meet を削除
```

```
--meet          Google Meet 会議を作成して紐付ける
--remove-meet   紐付いている会議を削除する
```

### JSON Output

`Event` に追加:

```json
{
  "meet_link": "https://meet.google.com/abc-defg-hij",
  "conference": { "type": "hangoutsMeet", "uri": "https://meet.google.com/abc-defg-hij" }
}
```

会議が無いイベントではどちらも `null`。Meet 以外の会議が付いたイベントでは
`meet_link` は `null` のまま、`conference` に実際の方式と URL が入る。
詳細は `spec/output.md` を参照。

### Dry-run

```
DRY RUN: Would create event:
  title: "Design review"
  start: "2026-09-01T10:00:00+09:00"
  end: "2026-09-01T11:00:00+09:00"
  meet: true
```

`requestId` は dry-run では生成しない。

## Implementation Steps

- [x] `src/types/index.ts`: `CalendarEvent.meet_link` を追加
- [x] `src/lib/api.test.ts`: `normalizeEvent()` の `meet_link` 抽出の失敗テスト（`hangoutLink` 優先 / `entryPoints` フォールバック / どちらも無ければ `null`）
- [x] `src/lib/api.ts`: `GoogleEvent` に `hangoutLink` / `conferenceData`、`GoogleEventWriteBody` に `conferenceData` を追加、`normalizeEvent()` を実装
- [x] `src/lib/api.ts`: `GoogleCalendarApi` の `events.insert/patch` パラメータに `conferenceDataVersion?: number` を追加
- [x] `src/commands/shared.ts`: `createGoogleCalendarApi()` のパススルーに `conferenceDataVersion` を通す
- [x] `src/lib/api.test.ts` / `api.ts`: `createEvent()` の `meet` オプション（`conferenceDataVersion: 1` が送られる / `requestId` が呼び出しごとに異なる / `meet` 未指定なら `conferenceData` も `conferenceDataVersion` も送らない）
- [x] `src/lib/api.test.ts` / `api.ts`: pending リトライ（1回目 pending → 2回目 success で `meet_link` が埋まる / 3回 pending なら `meet_link: null` / `failure` なら `API_ERROR`）
- [x] `src/lib/api.test.ts` / `api.ts`: `updateEvent()` の `meet` / `removeMeet`（`conferenceData: null` を送る / どちらも未指定なら `conferenceData` をリクエストに含めない）
- [x] `src/commands/add.test.ts` / `add.ts`: `--meet`、dry-run 出力、pending 時の stderr 注記
- [x] `src/commands/update.test.ts` / `update.ts`: `--meet` / `--remove-meet`（conflict 設定）
- [x] `src/lib/output.test.ts` / `output.ts`: `formatEventDetailText()` の Meet 行（`null` では出さない）
- [x] `spec/commands.md`: add / update のオプションと制約
- [x] `spec/output.md`: `Event` に `meet_link`、`gcal show` の text 出力例
- [x] `tests/integration/add-pipeline.test.ts`: `--meet` が `conferenceDataVersion: 1` 付きで API に届くこと
- [x] `bun run test` pass
- [x] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/google-meet.test.ts` を新規作成する。会議生成が非同期なため
**`meet_link` が即座に埋まることを前提にしない**（フレーク対策）。

- [x] `gcal add --meet -f json` が成功し、`meet_link` が URL または `null` であること
- [x] `meet_link` が `null` だった場合、数秒待って `gcal show -f json` で URL が取れること（リトライ付き）
- [x] `gcal update <id> --remove-meet` 後に `meet_link` が `null` になること
- [x] `--meet` を付けずに作ったイベントの `meet_link` が `null` であること（後方互換の確認）
- [x] 全日イベントに `--meet` を付けても成功すること（当初の禁止方針は撤回済み）
- [x] 作成したイベントを cleanup で削除する

テスト環境のカレンダーが会議作成に対応していない場合はスキップできるようにする
（`tests/e2e/helpers.ts` の既存パターンに合わせる）。

## Acceptance Criteria

- [x] `gcal add --meet` で Meet 付きイベントが作成され、`meet_link` が返る
- [x] `requestId` が呼び出しごとにユニークである
- [x] `conferenceDataVersion: 1` は `--meet` / `--remove-meet` 指定時のみ送られる
- [x] `--meet` を指定しない `update` が既存の会議を消さない
- [x] `pending` のときリトライし、なお未確定ならイベント作成は成功扱いで stderr に注記が出る
- [x] `failure` のとき `API_ERROR` になる
- [x] `gcal update --remove-meet` で会議が削除される
- [x] 全日イベント + `--meet` が `add` / `update` のどちらでも同じように通る
- [x] JSON 出力に `meet_link` が含まれる（会議なしなら `null`）
- [x] text / json / quiet 全フォーマットが動作する
- [x] 既存テストが pass する

## Notes

- `conferenceDataVersion: 1` は `--meet` / `--remove-meet` を指定したときだけリクエストに付ける。
  これが「指定しない `update` は既存の会議を保持する」という不変条件の実体で、
  `api.test.ts` と `update.test.ts` の両方で固定している。
- pending の注記は `api.ts` ではなくコマンド層（`add.ts` / `update.ts`）から出す。
  `api.ts` を IO から切り離したままにするため、コマンド側で
  「`--meet` を指定したのに `meet_link` が `null`」を判定して stderr に書く。
  仕様では `add` のみ言及していたが、`update --meet` でも同じ状況が起きるため同じ注記を出している。
- `--quiet` では pending の注記を出さない。`-q` は Event ID だけを返す契約のため。
- googleapis の型は `Schema$Event.conferenceData` を non-nullable として定義しているが、
  REST API は会議の削除に `conferenceData: null` を受け付ける。キャストは
  `src/commands/shared.ts` の変換関数 2 つに閉じ込め、コードベース側の型は実際に送る形を保っている。
- `resolveConference()` は pending のまま 3 回のポーリングを終えたイベントをそのまま返す。
  イベント自体は書き込み済みなので、コマンド全体を失敗させるより `meet_link: null` を返す方が正しい。
- E2E は実カレンダーに対して 6 件すべて pass することを確認済み
  （会議の作成・リンク取得・`--remove-meet` による削除を含む）。
- `CalendarEvent` に必須フィールドを 1 つ足したため、041 と同様にテストの `makeEvent`
  ファクトリ 8 箇所と `types.test.ts` の型リテラルを更新した。JSON 出力はフィールド追加のみで後方互換。
