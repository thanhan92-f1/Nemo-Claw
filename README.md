# NemoClaw Standalone API

Thư mục này chứa wrapper riêng cho NemoClaw, không sửa core code hiện có.

## Thành phần

- `server.js`: REST API + web UI `/chat` và `/terminal`
- `install.sh`: bootstrap 1 lệnh để clone repo của bạn, chạy NemoClaw root installer, rồi chuẩn bị `server.js`
- `postman/`: collection + environment cho Postman

## Phân biệt file install

- file install **bootstrap 1 lệnh** là: `https://raw.githubusercontent.com/thanhan92-f1/Nemo-Claw/refs/heads/main/standalone-api/install.sh`
- `ROOT_INSTALL_SCRIPT` là file local ở root repo hiện tại: `../install.sh`
- repo standalone chính là: `https://github.com/thanhan92-f1/Nemo-Claw.git`
- installer NemoClaw upstream tham chiếu là: `https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh`
- flow mới: 1 lệnh sẽ clone/reuse repo của bạn, chạy root `install.sh`, rồi chuẩn bị standalone API

## Chạy nhanh

```bash
curl -fsSL https://raw.githubusercontent.com/thanhan92-f1/Nemo-Claw/refs/heads/main/standalone-api/install.sh | bash
cd Nemo-Claw
source standalone-api/.env.local
node standalone-api/server.js
```

## Bước tiếp theo

1. Chạy bootstrap 1 lệnh:
	`curl -fsSL https://raw.githubusercontent.com/thanhan92-f1/Nemo-Claw/refs/heads/main/standalone-api/install.sh | bash`
2. Script sẽ clone hoặc dùng lại repo:
	`https://github.com/thanhan92-f1/Nemo-Claw.git`
3. Script sẽ chạy local `ROOT_INSTALL_SCRIPT`:
	`../install.sh`
4. Nạp biến môi trường:
	`source standalone-api/.env.local`
5. Start API:
	`node standalone-api/server.js`
6. Test nhanh:
	`GET http://127.0.0.1:3100/health`
7. Import Postman trong `standalone-api/postman/` để test full API

## Link chính

- Home: `http://127.0.0.1:3100/`
- Chat UI: `http://127.0.0.1:3100/chat?sandbox=my-assistant`
- Terminal UI: `http://127.0.0.1:3100/terminal?sandbox=my-assistant`
- API index: `http://127.0.0.1:3100/api`

## Nhóm API

- Global: version, help, list, status, presets, preset entries, onboard options, command surface, OpenShell diagnostics, environment summary
- Install: đọc metadata bootstrap 1 lệnh, xem root install local/upstream, hoặc trigger install qua API
- Onboard: chạy `nemoclaw onboard --non-interactive`
- Setup: wrapper cho `nemoclaw setup` và `nemoclaw setup-spark`
- Sandboxes: list, details, default sandbox, status, structured status, gateway state, readiness, NIM details, connect, logs, policies, raw policy, policy endpoints, policy preview merge, policy-add, destroy, ui links
- Inference: gateway status, live inference info, provider metadata, local provider catalog, provider diagnostics, Ollama model options, bootstrap options, local provider validation, NIM GPU info, NIM compatible models, port preflight
- Credentials: xem summary credential và lưu key qua API
- Policy details: xem chi tiết preset, preset entries và endpoints của preset
- Services: start, stop, raw status, structured status, per-service logs, alias `nemoclaw start/stop`
- Deployments: wrapper cho `nemoclaw deploy`
- Debug: wrapper cho `nemoclaw debug`
- Uninstall: wrapper cho `nemoclaw uninstall`
- Chat: `/api/chat`
- Safe terminal actions: `/api/terminal/exec`

## API bổ sung

- `GET /api/commands`
- `GET /api/list`
- `GET /api/openshell/diagnostics`
- `GET /api/install`
- `GET /api/install/script`
- `POST /api/install/run`
- `POST /api/setup`
- `POST /api/setup-spark`
- `POST /api/start`
- `POST /api/stop`
- `GET /api/gateway/status`
- `GET /api/preflight/port?port=18789`
- `GET /api/preflight/ports?ports=18789,3100`
- `POST /api/onboard/preview`
- `GET /api/sandboxes/default`
- `PUT /api/sandboxes/default`
- `GET /api/sandboxes/:name/status/structured`
- `GET /api/sandboxes/:name/gateway-state`
- `GET /api/sandboxes/:name/readiness`
- `GET /api/sandboxes/:name/nim`
- `GET /api/sandboxes/:name/policy/raw`
- `GET /api/sandboxes/:name/policy/endpoints`
- `GET /api/sandboxes/:name/policy/preview-merge?preset=telegram`
- `POST /api/sandboxes/:name/policy-add`
- `GET /api/inference`
- `GET /api/inference/providers`
- `GET /api/inference/local/providers`
- `GET /api/inference/local/providers/:provider/diagnostics?model=nemotron-3-nano:30b`
- `GET /api/nim/gpu`
- `GET /api/nim/models/compatible`
- `GET /api/inference/local/ollama/models`
- `GET /api/inference/local/default-model`
- `GET /api/inference/local/bootstrap-options`
- `POST /api/inference/local/validate`
- `GET /api/presets/:name`
- `GET /api/presets/:name/entries`
- `GET /api/presets/:name/endpoints`
- `GET /api/credentials`
- `PUT /api/credentials/:key`
- `GET /api/services/structured-status`
- `GET /api/services/logs/:service`

## Ghi chú

- Server dùng Node.js built-in, không cần cài package mới.
- `/chat` dùng SSH config từ `openshell sandbox ssh-config` để nhắn vào sandbox.
- `/terminal` chỉ cho phép một nhóm action an toàn đã allow-list.
- Một số endpoint hỗ trợ tham số tiện hơn như `port` cho connect/UI và `dashboardPort` cho start services.
- Các endpoint chẩn đoán sâu mới ưu tiên chế độ read-only/preview: không ghi policy trực tiếp nếu không gọi endpoint apply tương ứng.
- Các API services/logs dùng file trong `/tmp`, phù hợp nhất với Linux/WSL/macOS.
- flow cài đặt mới dùng bootstrap `standalone-api/install.sh` của repo `thanhan92-f1/Nemo-Claw`; script sẽ clone/reuse repo, chạy local `ROOT_INSTALL_SCRIPT`, rồi chuẩn bị standalone API.
- Nếu cần chat thực tế, sandbox phải tồn tại và OpenShell phải hoạt động.
- Import Postman files trong `standalone-api/postman/` để test nhanh toàn bộ API.
