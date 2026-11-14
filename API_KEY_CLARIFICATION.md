## Tello API Credentials Clarification

The key you provided `sk-0Bsc31L055HJGq3vcZj0PvSI1RBbuSCuKOtshKEwmTYIPl4S` **cannot be used as Telegram API credentials** because:

| Field | Required Format | Your key |
|-------|----------------|----------|
| `telegramApiId` | **Integer number** (e.g., `2040`, `123456`) | `sk-...` (string starting with `sk-`) |
| `telegramApiHash` | **32-character hex string** (e.g., `b18441a1ff607e10a989891a5462e627`) | `sk-0Bsc31L055...` (22+ chars, starts with `sk-`) |

### Where Telegram API comes from
- Website: <https://my.telegram.org>
- Section: "API development tools"
- You create a new application → get `api_id` (number) + `api_hash` (hex string)
- These are then pasted in **Tello Settings → Thông tin kỹ thuật Telegram**

### What the `sk-` prefix usually means
- **OpenAI API keys** (e.g., `sk-proj-...`, `sk-2...`)
- **Other services** with similar naming convention

### How to update in Tello
1. Go to <https://my.telegram.org> → log in → "API development tools"
2. Click "Create new application"
3. Fill the form → you'll get:
   - `api_id`: a number (e.g., `2040`, `1563459`)
   - `api_hash`: a 32-char hex string (e.g., `b18441a1ff607e10a989891a5462e627`)
4. In Tello app: **Settings** → **"Thông tin kỹ thuật Telegram"** → paste both values → **Lưu**
5. You'll need to **re-login Telegram** (the app will disconnect and require new code)

### If this key is for a different service
Please clarify:
- **Is this for OpenAI / LLM integration?** (Currently Tello doesn't use OpenAI keys)
- **Is this for replacing the `secret.key` / AES encryption?** (The `secret.key` is 32 random bytes, auto-generated)
- **Or is this a different API entirely?** Tell me what service, and I'll help you integrate it properly.

**Current status:** The app works with the default Telegram Desktop credentials (`api_id: 2040`, `api_hash: b18441a1ff607e10a989891a5462e627`). You can replace these anytime via Settings → "Thông tin kỹ thuật Telegram".