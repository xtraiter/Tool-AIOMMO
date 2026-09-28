import sys
import os
import time
import json
import uuid
import binascii
import hashlib
import hmac
from datetime import datetime
from urllib.parse import urlencode
import requests

BASE_URL = "https://editor-api-sg.capcutapi.com"
UPLOAD_SPACE = "capcut-pc-resource-sg"
APP_VERSION = "2.3.0"
PLATFORM_ID = "4"
DEVICE_ID = "7261867810632254977"
UA = "Cronet/TTNetVersion:01594da2 2023-03-14 QuicVersion:46688bb4 2022-11-28"

def create_sign(url_path: str) -> tuple:
    device_time = str(int(time.time()))
    raw = f"9e2c|{url_path[-7:]}|{PLATFORM_ID}|{APP_VERSION}|{device_time}|{DEVICE_ID}|11ac"
    return hashlib.md5(raw.encode()).hexdigest(), device_time

def make_headers(url_path: str) -> dict:
    sign, dt = create_sign(url_path)
    return {
        "Content-Type": "application/json",
        "appvr": APP_VERSION, "device-time": dt, "lan": "en", "loc": "VN",
        "pf": PLATFORM_ID, "sign": sign, "sign-ver": "1",
        "tdid": DEVICE_ID, "x-ss-dp": "359289", "user-agent": UA,
    }

def _aws4_sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

def _aws4_signature(secret_key, date_stamp, region, service, string_to_sign):
    k = _aws4_sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k = _aws4_sign(k, region)
    k = _aws4_sign(k, service)
    k = _aws4_sign(k, "aws4_request")
    return hmac.new(k, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

def _vod_headers(method, host, path, qs, ak, sk, st, body=""):
    now = datetime.utcnow()
    amz_date, ds = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    sh = "x-amz-date;x-amz-security-token"
    ph = hashlib.sha256(body.encode() if isinstance(body, str) else body).hexdigest()
    ch = f"x-amz-date:{amz_date}\nx-amz-security-token:{st}\n"
    cr = f"{method}\n{path}\n{qs}\n{ch}\n{sh}\n{ph}"
    cs = f"{ds}/sdwdmwlll/vod/aws4_request"
    sts = f"AWS4-HMAC-SHA256\n{amz_date}\n{cs}\n{hashlib.sha256(cr.encode()).hexdigest()}"
    sig = _aws4_signature(sk, ds, "sdwdmwlll", "vod", sts)
    return {
        "Host": host, "User-Agent": f"BDFileUpload({int(time.time()*1000)})",
        "X-Amz-Date": amz_date, "X-Amz-Expires": "31536000",
        "X-Amz-Security-Token": st,
        "Authorization": f"AWS4-HMAC-SHA256 Credential={ak}/{cs}, SignedHeaders={sh}, Signature={sig}",
        "accept-encoding": "identity",
    }

def transcribe(audio_path: str, language: str = "vi-VN", start_offset_ms: int = 0) -> list:
    file_size = os.path.getsize(audio_path)
    
    # Step 1: Upload credentials
    path = "/lv/v1/upload_sign"
    r = requests.post(f"{BASE_URL}{path}",
                      data=json.dumps({"biz": "capcut-pc-resource", "key_version": "v5"}),
                      headers=make_headers(path), timeout=15).json()
    if r.get("ret") != "0":
        raise Exception(f"upload_sign failed: {r.get('errmsg')}")
    creds = r["data"]
    ak, sk, st = creds["access_key_id"], creds["secret_access_key"], creds.get("session_token", "")
    domain = creds["domain"]
    
    # Step 2a: Apply upload
    ap = {"Action": "ApplyUploadInner", "FileType": "video", "IsInner": "1",
          "SpaceName": UPLOAD_SPACE, "UseQuic": "false", "Version": "2020-11-19", "device_platform": "win"}
    qs = urlencode(sorted(ap.items()))
    h = _vod_headers("GET", domain, "/top/v1", qs, ak, sk, st)
    ar = requests.get(f"https://{domain}/top/v1", params=ap, headers=h, timeout=15).json()
    node = ar["Result"]["InnerUploadAddress"]["UploadNodes"][0]
    si = node["StoreInfos"][0]
    upload_host, store_uri, auth_tok, session_key = node["UploadHost"], si["StoreUri"], si["Auth"], node["SessionKey"]
    
    # Step 2b: Upload file
    with open(audio_path, "rb") as f:
        file_data = f.read()
    crc32 = format(binascii.crc32(file_data) & 0xFFFFFFFF, "08x")
    ur = requests.post(f"https://{upload_host}/upload/v1/{store_uri}",
                       data=file_data,
                       headers={"Authorization": auth_tok, "Content-Type": "application/octet-stream",
                                "User-Agent": f"BDFileUpload({int(time.time()*1000)})", "Content-CRC32": crc32},
                       timeout=600).json()
    if ur.get("code") != 2000:
        raise Exception(f"Upload failed: {ur}")
        
    # Step 2c: Commit
    cp = {"Action": "CommitUploadInner", "SpaceName": UPLOAD_SPACE, "Version": "2020-11-19"}
    cb = json.dumps({"Functions": [{"Input": {"SnapshotTime": 0.0}, "Name": "Snapshot"}], "SessionKey": session_key})
    cqs = urlencode(sorted(cp.items()))
    ch = _vod_headers("POST", domain, "/top/v1", cqs, ak, sk, st, cb)
    ch["Content-Type"] = "application/json"
    cr = requests.post(f"https://{domain}/top/v1", params=cp, data=cb, headers=ch, timeout=30).json()
    meta = cr["Result"]["Results"][0]["VideoMeta"]
    audio_uri, duration = meta["Uri"], meta["Duration"]
    
    # Step 3: Submit STT
    path = "/lv/v1/audio_subtitle/submit"
    body = json.dumps({
        "adjust_endtime": 200, "audio": audio_uri, "caption_type": 0,
        "client_request_id": str(uuid.uuid4()), "language": language,
        "max_lines": 1, "songs_info": [{"end_time": duration * 1000, "id": "", "start_time": 0}],
        "words_per_line": 15,
    })
    sr = requests.post(f"{BASE_URL}{path}", data=body, headers=make_headers(path), timeout=15).json()
    if sr.get("ret") != "0":
        raise Exception(f"STT submit failed: {sr.get('errmsg')} (ret={sr.get('ret')})")
    task_id = sr["data"]["id"]
    
    # Step 4: Poll results
    path = "/lv/v1/audio_subtitle/query"
    qbody = json.dumps({"id": task_id, "pack_options": {"need_attribute": True}})
    for attempt in range(300):
        try:
            qr_resp = requests.post(f"{BASE_URL}{path}", data=qbody, headers=make_headers(path), timeout=180)
            qr = qr_resp.json()
        except Exception:
            time.sleep(3)
            continue
        if qr.get("ret") == "0":
            utterances = qr.get("data", {}).get("utterances", [])
            if utterances:
                if start_offset_ms:
                    for utt in utterances:
                        utt['start_time'] += start_offset_ms
                        utt['end_time'] += start_offset_ms
                return utterances
        time.sleep(3)
    raise TimeoutError("STT did not complete in time")

def save_srt(utterances: list, output_path: str):
    def ms_to_ts(ms):
        s = ms / 1000
        h, s = divmod(s, 3600)
        m, s = divmod(s, 60)
        ms_part = int((s % 1) * 1000)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{ms_part:03d}"
    with open(output_path, "w", encoding="utf-8") as f:
        for i, u in enumerate(utterances, 1):
            f.write(f"{i}\n{ms_to_ts(u['start_time'])} --> {ms_to_ts(u['end_time'])}\n{u['text']}\n\n")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python capcut_stt.py <audio_path> <output_srt_path> [language_code] [--start-offset-ms OFFSET]")
        sys.exit(1)
        
    audio = sys.argv[1]
    srt_out = sys.argv[2]
    lang = sys.argv[3] if len(sys.argv) > 3 else "vi-VN"
    start_offset_ms = 0
    if "--start-offset-ms" in sys.argv:
        idx = sys.argv.index("--start-offset-ms")
        if idx + 1 < len(sys.argv):
            start_offset_ms = int(sys.argv[idx + 1])
    
    try:
        results = transcribe(audio, language=lang, start_offset_ms=start_offset_ms)
        save_srt(results, srt_out)
        print("STT SUCCESS")
    except Exception as e:
        print(f"STT ERROR: {e}")
        sys.exit(1)
