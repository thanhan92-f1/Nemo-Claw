# NemoClaw Standalone API

Thư mục này chứa wrapper riêng cho NemoClaw, không sửa core code hiện có.

## Thành phần

- `server.js`: REST API + web UI `/chat` và `/terminal`
- `install.sh`: script phụ để chuẩn bị chạy `server.js`
- `postman/`: collection + environment cho Postman

## Phân biệt file install

- file install **bootstrap chính** là: `https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh`
- `ROOT_INSTALL_SCRIPT` là file local ở root repo hiện tại: `../install.sh`
- repo root tương ứng là: `https://github.com/NVIDIA/NemoClaw.git`
- file `standalone-api/install.sh` chỉ là file **cài thêm / helper** cho wrapper này
- wrapper không thay thế installer chính của flow cài đặt

## Chạy nhanh

```bash
bash standalone-api/install.sh
source standalone-api/.env.local
node standalone-api/server.js
```

## Bước tiếp theo

1. Chạy bootstrap installer:
	`curl -fsSL https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh | bash`
2. Kiểm tra `ROOT_INSTALL_SCRIPT` local:
	`../install.sh`
3. Đảm bảo root source dùng repo:
	`https://github.com/NVIDIA/NemoClaw.git`
4. Chạy helper:
	`bash standalone-api/install.sh`
5. Nạp biến môi trường:
	`source standalone-api/.env.local`
6. Start API:
	`node standalone-api/server.js`
7. Test nhanh:
	`GET http://127.0.0.1:3100/health`
8. Import Postman trong `standalone-api/postman/` để test full API

## Link chính

- Home: `http://127.0.0.1:3100/`
- Chat UI: `http://127.0.0.1:3100/chat?sandbox=my-assistant`
- Terminal UI: `http://127.0.0.1:3100/terminal?sandbox=my-assistant`
- API index: `http://127.0.0.1:3100/api`

## Nhóm API

- Global: version, help, list, status, presets, onboard options, command surface
- Install: đọc metadata bootstrap installer, xem repo root install, hoặc trigger bootstrap installer qua API
- Onboard: chạy `nemoclaw onboard --non-interactive`
- Setup: wrapper cho `nemoclaw setup` và `nemoclaw setup-spark`
- Sandboxes: list, details, default sandbox, status, structured status, gateway state, readiness, NIM details, connect, logs, policies, raw policy, policy-add, destroy, ui links
- Inference: gateway status, live inference info, provider metadata, Ollama model options, bootstrap options, local provider validation, NIM GPU info, port preflight
- Credentials: xem summary credential và lưu key qua API
- Policy details: xem chi tiết preset và endpoints của preset
- Services: start, stop, raw status, structured status, per-service logs, alias `nemoclaw start/stop`
- Deployments: wrapper cho `nemoclaw deploy`
- Debug: wrapper cho `nemoclaw debug`
- Uninstall: wrapper cho `nemoclaw uninstall`
- Chat: `/api/chat`
- Safe terminal actions: `/api/terminal/exec`

## API bổ sung

- `GET /api/commands`
- `GET /api/list`
- `GET /api/install`
- `GET /api/install/script`
- `POST /api/install/run`
- `POST /api/setup`
- `POST /api/setup-spark`
- `POST /api/start`
- `POST /api/stop`
- `GET /api/gateway/status`
- `GET /api/preflight/port?port=18789`
- `POST /api/onboard/preview`
- `GET /api/sandboxes/default`
- `PUT /api/sandboxes/default`
- `GET /api/sandboxes/:name/status/structured`
- `GET /api/sandboxes/:name/gateway-state`
- `GET /api/sandboxes/:name/readiness`
- `GET /api/sandboxes/:name/nim`
- `GET /api/sandboxes/:name/policy/raw`
- `POST /api/sandboxes/:name/policy-add`
- `GET /api/inference`
- `GET /api/inference/providers`
- `GET /api/nim/gpu`
- `GET /api/inference/local/ollama/models`
- `GET /api/inference/local/bootstrap-options`
- `POST /api/inference/local/validate`
- `GET /api/presets/:name`
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
- Các API services/logs dùng file trong `/tmp`, phù hợp nhất với Linux/WSL/macOS.
- flow cài đặt dùng bootstrap raw URL chính thức của NVIDIA trước; `ROOT_INSTALL_SCRIPT` là file local `../install.sh`; file `standalone-api/install.sh` chỉ là helper phụ.
- Nếu cần chat thực tế, sandbox phải tồn tại và OpenShell phải hoạt động.
- Import Postman files trong `standalone-api/postman/` để test nhanh toàn bộ API.
