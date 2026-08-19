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

`event.hangoutLink` を第一候補とし、無ければ
`conferenceData.entryPoints[]` から `entryPointType === "video"` の `uri` を拾う。
どちらも無ければ `null`。

`src/types/index.ts` の `CalendarEvent` に `meet_link: string | null` を追加する（フィールド追加のみで後方互換）。

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

全日イベントに Meet を付けること自体は API が許容するが実用的でないため、
`--meet` と全日イベント（`--start` が日付のみ）の組み合わせは `INVALID_ARGS` で弾く。

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
`API_ERROR` にそのまま流すが、`--meet` 指定時の 400 には
「このカレンダーは会議の作成に対応していない可能性がある」旨のヒントを添える。

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
  "meet_link": "https://meet.google.com/abc-defg-hij"
}
```

会議が無いイベントでは `null`。

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

- [ ] `src/types/index.ts`: `CalendarEvent.meet_link` を追加
- [ ] `src/lib/api.test.ts`: `normalizeEvent()` の `meet_link` 抽出の失敗テスト（`hangoutLink` 優先 / `entryPoints` フォールバック / どちらも無ければ `null`）
- [ ] `src/lib/api.ts`: `GoogleEvent` に `hangoutLink` / `conferenceData`、`GoogleEventWriteBody` に `conferenceData` を追加、`normalizeEvent()` を実装
- [ ] `src/lib/api.ts`: `GoogleCalendarApi` の `events.insert/patch` パラメータに `conferenceDataVersion?: number` を追加
- [ ] `src/commands/shared.ts`: `createGoogleCalendarApi()` のパススルーに `conferenceDataVersion` を通す
- [ ] `src/lib/api.test.ts` / `api.ts`: `createEvent()` の `meet` オプション（`conferenceDataVersion: 1` が送られる / `requestId` が呼び出しごとに異なる / `meet` 未指定なら `conferenceData` も `conferenceDataVersion` も送らない）
- [ ] `src/lib/api.test.ts` / `api.ts`: pending リトライ（1回目 pending → 2回目 success で `meet_link` が埋まる / 3回 pending なら `meet_link: null` / `failure` なら `API_ERROR`）
- [ ] `src/lib/api.test.ts` / `api.ts`: `updateEvent()` の `meet` / `removeMeet`（`conferenceData: null` を送る / どちらも未指定なら `conferenceData` をリクエストに含めない）
- [ ] `src/commands/add.test.ts` / `add.ts`: `--meet`、全日イベントとの conflict、dry-run 出力、pending 時の stderr 注記
- [ ] `src/commands/update.test.ts` / `update.ts`: `--meet` / `--remove-meet`（conflict 設定）
- [ ] `src/lib/output.test.ts` / `output.ts`: `formatEventDetailText()` の Meet 行（`null` では出さない）
- [ ] `spec/commands.md`: add / update のオプションと制約
- [ ] `spec/output.md`: `Event` に `meet_link`、`gcal show` の text 出力例
- [ ] `tests/integration/add-pipeline.test.ts`: `--meet` が `conferenceDataVersion: 1` 付きで API に届くこと
- [ ] `bun run test` pass
- [ ] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/google-meet.test.ts` を新規作成する。会議生成が非同期なため
**`meet_link` が即座に埋まることを前提にしない**（フレーク対策）。

- [ ] `gcal add --meet -f json` が成功し、`meet_link` が URL または `null` であること
- [ ] `meet_link` が `null` だった場合、数秒待って `gcal show -f json` で URL が取れること（リトライ付き）
- [ ] `gcal update <id> --remove-meet` 後に `meet_link` が `null` になること
- [ ] `--meet` を付けずに作ったイベントの `meet_link` が `null` であること（後方互換の確認）
- [ ] 全日イベントに `--meet` を付けると exit code 3（`INVALID_ARGS`）であること
- [ ] 作成したイベントを cleanup で削除する

テスト環境のカレンダーが会議作成に対応していない場合はスキップできるようにする
（`tests/e2e/helpers.ts` の既存パターンに合わせる）。

## Acceptance Criteria

- [ ] `gcal add --meet` で Meet 付きイベントが作成され、`meet_link` が返る
- [ ] `requestId` が呼び出しごとにユニークである
- [ ] `conferenceDataVersion: 1` は `--meet` / `--remove-meet` 指定時のみ送られる
- [ ] `--meet` を指定しない `update` が既存の会議を消さない
- [ ] `pending` のときリトライし、なお未確定ならイベント作成は成功扱いで stderr に注記が出る
- [ ] `failure` のとき `API_ERROR` になる
- [ ] `gcal update --remove-meet` で会議が削除される
- [ ] 全日イベント + `--meet` が `INVALID_ARGS` で弾かれる
- [ ] JSON 出力に `meet_link` が含まれる（会議なしなら `null`）
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] 既存テストが pass する
