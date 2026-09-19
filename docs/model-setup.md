# Cấu hình chạy các chức năng dùng mô hình AI

Các chức năng AI của AIOMMO Studio **chạy hoàn toàn trên trình duyệt của người dùng** (ONNX Runtime Web).
Máy chủ của bạn không cần GPU; mô hình được tải về máy người dùng ở lần dùng đầu tiên rồi lưu trong Cache Storage
(lần sau nạp tức thì, không tải lại).

## 1. Chức năng nào cần mô hình

| Chức năng | Slug | Mô hình | Dung lượng | Ghi chú |
|---|---|---|---|---|
| Tách Lời & Beat – mức Nhẹ | `premium.vocal.separator` | UVR MDX-Net (`UVR_MDXNET_9482.onnx`) | ~29 MB | chạy tốt trên điện thoại |
| Tách Lời & Beat – Cân bằng | ↑ | UVR MDX-Net Voc FT (`UVR-MDX-NET-Voc_FT.onnx`) | ~67 MB | nên có WebGPU |
| Tách Lời & Beat – Cao cấp | ↑ | HTDemucs (`htdemucs_embedded.onnx`) | ~181 MB | 4 luồng, cần máy mạnh + WebGPU |
| Xóa Logo/Watermark – Nhanh & nhẹ | `premium.watermark.remover` | MI-GAN pipeline (`migan_pipeline.onnx`) | ~28 MB | mặc định trên điện thoại |
| Xóa Logo/Watermark – Chất lượng cao | ↑ | Big-LaMa (`lama_fp32.onnx`) | ~208 MB | mặc định trên máy tính |
| Ghi âm → văn bản / AI Tạo Phụ Đề – Nhẹ | `premium.audio.record`, `premium.video.subtitle` | Whisper Base (`onnx-community/whisper-base`, q8) | ~77 MB | chạy trên điện thoại |
| ↑ – Cân bằng | ↑ | Whisper Small (`onnx-community/whisper-small`, q8) | ~250 MB | tiếng Việt khá |
| ↑ – Cao cấp | ↑ | Whisper Large-v3 Turbo (`onnx-community/whisper-large-v3-turbo`, q4f16) | ~563 MB | cần WebGPU, chính xác nhất |

Riêng Whisper: mã chạy nằm ở `public/asr/worker.js` (nạp thư viện transformers.js từ jsdelivr, phiên bản ghim cứng) và cấu hình mô hình ở `lib/asr/models.ts`. Nếu đặt `NEXT_PUBLIC_MODEL_BASE_URL`, mô hình được lấy từ `<BASE>/<repo>/onnx/<file>` (giữ nguyên cấu trúc thư mục Hugging Face, ví dụ `<BASE>/onnx-community/whisper-base/onnx/encoder_model_quantized.onnx`, cùng các file `config.json`, `tokenizer.json`, `preprocessor_config.json`...). Muốn chạy hoàn toàn không phụ thuộc jsdelivr, tải file thư viện về `public/` và sửa hằng `LIB` trong worker.

Các chức năng **không** dùng mô hình (FFmpeg/Web Audio thuần): cắt/nối video, cắt nhạc, tăng âm lượng, trích xuất âm thanh,
quay màn hình, thu âm (phần chuyển thành văn bản thì có), Trình Dựng Video, và chế độ *Video (logo cố định)* của Xóa Watermark (bộ lọc `delogo`).

Nguồn mặc định (Hugging Face, công khai, có CORS):

- `https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/UVR_MDXNET_9482.onnx`
- `https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/UVR-MDX-NET-Voc_FT.onnx`
- `https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx`
- `https://huggingface.co/anyisalin/migan-onnx/resolve/main/onnx/migan_pipeline.onnx`
- `https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx`

Định nghĩa nằm ở `lib/separation/models.ts` và `lib/inpaint/models.ts` (thêm/bớt mô hình chỉ cần sửa hai file này).
Trước khi phát hành, hãy tự kiểm tra giấy phép của từng mô hình có phù hợp với mục đích thương mại của bạn không.

## 2. Cài đặt lần đầu

```bash
npm install          # tự chạy scripts/copy-ort.js: chép ONNX Runtime Web vào public/ort (~45 MB, không commit)
npm run dev          # hoặc npm run dev:all nếu cần cả backend TTS
```

Nếu `public/ort/` trống, chạy tay: `node scripts/copy-ort.js`.

## 3. Đặt mô hình trên máy chủ/CDN của riêng bạn (khuyến nghị khi chạy thật)

Mặc định người dùng tải từ Hugging Face. Để nhanh và ổn định hơn:

1. Tải các file `.onnx` ở bảng trên về một thư mục (giữ **đúng tên file**), ví dụ đưa lên Cloudflare R2 / S3 / Bunny / VPS.
2. Thêm vào `.env.local` (hoặc biến môi trường khi build):

   ```env
   NEXT_PUBLIC_MODEL_BASE_URL=https://cdn.tenmiencuaban.com/models
   ```

   Khi đặt biến này, ứng dụng tải `<BASE>/<tên file>` thay cho Hugging Face. **Phải build lại** sau khi đổi (biến `NEXT_PUBLIC_*`).
3. Máy chủ chứa mô hình cần trả header CORS, vì trang chạy với `Cross-Origin-Embedder-Policy: require-corp`:

   ```
   Access-Control-Allow-Origin: *
   Cross-Origin-Resource-Policy: cross-origin
   ```

   Bật nén (gzip/br) và cache dài (`Cache-Control: public, max-age=31536000, immutable`) cho các file này.

## 4. Yêu cầu trình duyệt / thiết bị

- Tất cả chạy được bằng WASM (CPU). WebGPU (Chrome/Edge mới) chỉ giúp nhanh hơn ở các mô hình lớn.
- `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` đã được bật trong `next.config.mjs`
  để có SharedArrayBuffer (FFmpeg đa luồng và ONNX đa luồng). Đừng bỏ hai header này khi deploy sau reverse-proxy.
- RAM gợi ý: mô hình nhẹ ≥ 2 GB, mô hình lớn (LaMa, HTDemucs) ≥ 4–8 GB. Ảnh lớn hơn 4096 px được thu nhỏ trước khi xử lý.
- Người dùng có thể xóa mô hình đã lưu bằng nút *Xóa mô hình đã lưu trong máy* trong từng công cụ.

## 5. Chức năng cần backend (không phải mô hình chạy trên trình duyệt)

| Chức năng | Cần gì |
|---|---|
| Tải video/album (yt-dlp) | `yt-dlp`, `ffmpeg`, `node` trên máy chủ (VPS; không chạy được trên hosting tĩnh/serverless) |
| Link tải có ký | biến `PROXY_SECRET` |
| Tạo giọng nói AI | dịch vụ TTS phía máy chủ, cấu hình trong `.env.local` (xem `app/api/audio/tts/route.ts`); chạy cùng `npm run dev:all` |

## 6. Kiểm tra nhanh sau khi cấu hình

1. Mở `/app?tool=premium.watermark.remover`, chọn một ảnh, tô lên logo, bấm **Xóa phần đã tô** – lần đầu sẽ thấy thanh tải mô hình.
2. Mở DevTools → Network: file `.onnx` phải tải từ đúng nguồn bạn cấu hình (Hugging Face hoặc `NEXT_PUBLIC_MODEL_BASE_URL`).
3. Mở lại công cụ: nhãn mô hình đổi thành *Đã lưu trong máy* và không còn tải lại.
