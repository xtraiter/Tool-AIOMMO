import { companyRegisterUrl } from "@/features/company/companyLinks";

export type AppFeature = {
  id?: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  route_path: string | null;
  icon_name: string | null;
  sort_order: number;
  is_admin_only: boolean;
  is_licensed_separately?: boolean;
  badge?: string;
};

export const HIDDEN_NAV_FEATURE_SLUGS = new Set([
  "content.history",
  "video.clypra"
]);

export function visibleNavFeatures(features: AppFeature[]) {
  return features.filter((feature) => !HIDDEN_NAV_FEATURE_SLUGS.has(feature.slug));
}

const PREMIUM_URL = companyRegisterUrl("app");

export const NAV_CATEGORY_ORDER = ["download", "video", "audio", "image", "office"];

// Tải Video & Album — chưa build được (cần scrape API nền tảng bên thứ ba), dẫn sang All In One MMO.
const DOWNLOAD_FEATURES: AppFeature[] = [
  {
    slug: "premium.downloader",
    name: "Tải Video & Album Ảnh Đa Nền Tảng",
    description: "Bóc tách video HD không logo và album ảnh từ Facebook, TikTok, Douyin, YouTube...",
    category: "download",
    route_path: "/download/multi",
    icon_name: "download",
    sort_order: 10,
    is_admin_only: false,
    badge: "HOẠT ĐỘNG"
  },
  {
    slug: "premium.album",
    name: "Tải Album Ảnh HD Không Logo",
    description: "Tải trọn bộ album ảnh Facebook, TikTok, Douyin ở độ phân giải gốc cao nhất.",
    category: "download",
    route_path: "/download/album",
    icon_name: "image",
    sort_order: 20,
    is_admin_only: false,
    badge: "HD GỐC"
  },
  {
    slug: "premium.channel.scanner",
    name: "Tải Hàng Loạt Danh Sách",
    description: "Dán danh sách link hoặc quét toàn bộ kênh để tải hàng loạt clip về máy.",
    category: "download",
    route_path: "/download/scanner",
    icon_name: "radar",
    sort_order: 30,
    is_admin_only: false,
    badge: "HÀNG LOẠT"
  },
  {
    slug: "premium.product.info",
    name: "Lấy Thông Tin Sản Phẩm E-Commerce",
    description: "Bóc tách mô tả, ảnh HD, video sản phẩm và bảng giá từ Shopee & TikTok Shop.",
    category: "download",
    route_path: "/download/ecommerce",
    icon_name: "shopping-bag",
    sort_order: 40,
    is_admin_only: false,
    badge: "SHOPEE & TIKTOK"
  }
];

// Công Cụ Video — miễn phí, xử lý trên trình duyệt (trừ mục có route_path ngoài).
const VIDEO_FEATURES: AppFeature[] = [
  {
    slug: "video.cut",
    name: "Cắt / Trim Video",
    description: "Cắt phân đoạn clip chuẩn xác theo mốc thời gian, xuất MP4 ngay trên trình duyệt.",
    category: "video",
    route_path: "/video/cut",
    icon_name: "scissors",
    sort_order: 10,
    is_admin_only: false,
    badge: "CHÍNH XÁC"
  },
  {
    slug: "video.join",
    name: "Ghép Video Online",
    description: "Thả nhiều đoạn clip MP4 vào để ghép thành 1 video, không cần cài phần mềm.",
    category: "video",
    route_path: "/video/join",
    icon_name: "combine",
    sort_order: 20,
    is_admin_only: false,
    badge: "SIÊU TỐC"
  },
  {
    slug: "video.screenrecord",
    name: "Quay Màn Hình Online",
    description: "Quay desktop, cửa sổ ứng dụng hoặc tab trình duyệt kèm âm thanh, xuất MP4/WebM tức thì.",
    category: "video",
    route_path: "/video/screenrecord",
    icon_name: "monitor-play",
    sort_order: 30,
    is_admin_only: false,
    badge: "TRỰC TIẾP"
  },
  {
    slug: "audio.extract",
    name: "Tách Nhạc Từ Video",
    description: "Trích xuất toàn bộ luồng âm thanh từ video sang MP3 chất lượng cao.",
    category: "video",
    route_path: "/audio/extract",
    icon_name: "audio-lines",
    sort_order: 40,
    is_admin_only: false
  },
  {
    slug: "premium.video.subtitle",
    name: "AI Tự Động Tạo Phụ Đề Video",
    description: "AI nhận diện giọng nói, tự động tạo phụ đề và chỉnh sửa và xuất file SRT / VTT / TXT ngay trên trình duyệt.",
    category: "video",
    route_path: "/video/subtitle",
    icon_name: "captions",
    sort_order: 50,
    is_admin_only: false,
    badge: "AI ENGINE"
  },
  {
    slug: "video.timeline",
    name: "Trình Dựng Video Timeline",
    description: "Dựng video đa rãnh: ghép nhiều clip/ảnh, chèn nhạc nền, lồng chữ phụ đề, kết xuất MP4.",
    category: "video",
    route_path: "/video/timeline",
    icon_name: "layers-3",
    sort_order: 60,
    is_admin_only: false,
    badge: "MINI STUDIO"
  }
];

// Âm Thanh — miễn phí, xử lý trên trình duyệt (trừ mục có route_path ngoài).
const AUDIO_FEATURES: AppFeature[] = [
  {
    slug: "premium.audio.tts",
    name: "Tạo Giọng Nói AI",
    description: "Chuyển văn bản thành giọng đọc tự nhiên bằng AI, hỗ trợ kịch bản hội thoại đa nhân vật.",
    category: "audio",
    route_path: "/audio/tts",
    icon_name: "mic-vocal",
    sort_order: 10,
    is_admin_only: false,
    badge: "MỚI"
  },
  {
    slug: "audio.cut",
    name: "Cắt & Biên Tập Nhạc",
    description: "Sóng âm trực quan, kéo chọn cắt nhạc, fade in/out, xuất file ngay trong trình duyệt.",
    category: "audio",
    route_path: "/audio/cut",
    icon_name: "music",
    sort_order: 20,
    is_admin_only: false,
    badge: "CHÍNH XÁC"
  },
  {
    slug: "premium.vocal.separator",
    name: "AI Tách Lời & Beat Karaoke",
    description: "Tách giọng hát và beat karaoke bằng AI ngay trên trình duyệt, chọn mức Nhẹ / Cân bằng / Cao cấp theo cấu hình máy.",
    category: "audio",
    route_path: "/audio/vocal",
    icon_name: "waves",
    sort_order: 30,
    is_admin_only: false,
    badge: "AI ENGINE"
  },
  {
    slug: "audio.volume",
    name: "Tăng Âm Lượng Video / Nhạc",
    description: "Khuếch đại âm thanh nhỏ lên rõ ràng mà không bị rè hoặc vỡ tiếng.",
    category: "audio",
    route_path: "/audio/volume",
    icon_name: "zap",
    sort_order: 40,
    is_admin_only: false,
    badge: "500% BOOST"
  },
  {
    slug: "audio.record",
    name: "Ghi Âm Giọng Nói",
    description: "Thu âm trực tiếp qua micro với biểu đồ sóng âm thời gian thực, tải file WebM ngay.",
    category: "audio",
    route_path: "/audio/record",
    icon_name: "mic",
    sort_order: 50,
    is_admin_only: false,
    badge: "MICRO LIVE"
  },
  {
    slug: "audio.extract.audiotab",
    name: "Tách Nhạc Từ Video",
    description: "Trích xuất toàn bộ luồng âm thanh từ video sang MP3 chất lượng cao.",
    category: "audio",
    route_path: "/audio/extract",
    icon_name: "audio-lines",
    sort_order: 60,
    is_admin_only: false,
    badge: "MP3 320K"
  }
];

// Hình ảnh
const IMAGE_FEATURES: AppFeature[] = [
  {
    slug: "premium.watermark.remover",
    name: "Xóa Logo Watermark AI",
    description: "Xoá logo, chữ & watermark khỏi ảnh/video tự động, không làm mờ hay vỡ nét.",
    category: "image",
    route_path: "/image/watermark",
    icon_name: "eraser",
    sort_order: 10,
    is_admin_only: false,
    badge: "AI ENGINE"
  }
];

// Công cụ văn phòng
const OFFICE_FEATURES: AppFeature[] = [
  {
    slug: "utility.convert",
    name: "Chuyển Đổi Định Dạng Tệp",
    description: "Đổi Word sang PDF, PDF sang ảnh/văn bản, ảnh sang PDF, đổi định dạng ảnh, video và âm thanh ngay trên trình duyệt.",
    category: "office",
    route_path: "/office/convert",
    icon_name: "file-text",
    sort_order: 10,
    is_admin_only: false,
    badge: "MIỄN PHÍ"
  },
  {
    slug: "utility.zip",
    name: "Giải Nén File ZIP Online",
    description: "Xem danh sách và giải nén tập tin bên trong file ZIP ngay trên trình duyệt.",
    category: "office",
    route_path: "/utility/zip",
    icon_name: "folder-archive",
    sort_order: 20,
    is_admin_only: false,
    badge: "SIÊU NHANH"
  }
];

export const DEFAULT_LOCAL_FEATURES: AppFeature[] = [
  ...DOWNLOAD_FEATURES,
  ...VIDEO_FEATURES,
  ...AUDIO_FEATURES,
  ...IMAGE_FEATURES,
  ...OFFICE_FEATURES
];
