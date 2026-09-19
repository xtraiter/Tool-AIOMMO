import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, voiceId } = body;

    if (!text) {
      return NextResponse.json({ error: "Văn bản không được để trống" }, { status: 400 });
    }

    // Địa chỉ server API Wrapper mã nguồn mở (ví dụ: K07VN hoặc kuwacom)
    // Nếu bạn cài đặt server local hoặc vps, hãy cấu hình ở file .env
    const ttsApiUrl = process.env.CAPCUT_TTS_API_URL;

    if (!ttsApiUrl) {
      return NextResponse.json(
        { 
          error: "Tính năng chưa được cấu hình Backend. Vui lòng thiết lập biến môi trường CAPCUT_TTS_API_URL trỏ tới server API của bạn." 
        },
        { status: 501 }
      );
    }

    // Format request payload tùy thuộc vào server Wrapper bạn đang sử dụng
    // Dưới đây là ví dụ payload chung chung, bạn có thể cần chỉnh sửa lại theo cấu trúc của repo bạn chọn.
    const requestBody = {
      text: text,
      speaker: voiceId || "v_nam_1",
    };

    const response = await fetch(ttsApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Lỗi từ TTS Server:", errText);
      return NextResponse.json({ error: "Lỗi từ server xử lý giọng nói." }, { status: response.status });
    }

    // Giả sử API trả về trực tiếp file âm thanh (audio/mpeg)
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="voice.mp3"',
      },
    });

  } catch (error: any) {
    console.error("Lỗi API TTS:", error);
    return NextResponse.json({ error: "Lỗi máy chủ nội bộ" }, { status: 500 });
  }
}
