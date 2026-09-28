import sys
import os
import time
import json
import uuid
import hashlib
import base64
import secrets
import requests
from urllib.parse import urlencode

BASE_URL = "https://editor-api-sg.capcutapi.com"
TTS_SIGN_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zY
CMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB
8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0
v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guA
Z4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zh
D/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36
mwIDAQAB
-----END PUBLIC KEY-----"""

DEVICE = {
    "aid": "359289",
    "app_name": "CapCut",
    "appvr": "8.7.0",
    "version_name": "8.7.0",
    "version_code": "8.7.0",
    "channel": "capcutpc_google",
    "device_platform": "mac",
    "device_type": "MacBookPro17,1",
    "device_brand": "MacBookPro17,1",
    "os_version": "15.7.4",
    "device_id": "7647183892936328721",
    "iid": "7647185302080423697",
    "region": "VN",
    "loc": "VN",
    "lan": "vi-VN",
    "pf": "3",
    "tdid": "7647183892936328721",
}

DEVICE_ID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capcut_device.json")

def _gen_bytedance_id():
    return str(secrets.randbelow(7699999999999999999 - 7300000000000000000) + 7300000000000000000)

def apply_device_ids(rotate=False):
    ids = None
    if not rotate and os.path.exists(DEVICE_ID_FILE):
        try:
            with open(DEVICE_ID_FILE, "r", encoding="utf-8") as fp:
                ids = json.load(fp)
        except Exception:
            ids = None
    if not ids or not ids.get("device_id") or not ids.get("iid"):
        device_id = _gen_bytedance_id()
        ids = {"device_id": device_id, "iid": _gen_bytedance_id(), "tdid": device_id}
        try:
            with open(DEVICE_ID_FILE, "w", encoding="utf-8") as fp:
                json.dump(ids, fp)
        except Exception:
            pass
    DEVICE["device_id"] = ids["device_id"]
    DEVICE["iid"] = ids["iid"]
    DEVICE["tdid"] = ids.get("tdid", ids["device_id"])

def compact_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

def make_x_ss_stub(body_text):
    return hashlib.md5(body_text.encode("utf-8")).hexdigest()

def _der_len(data, pos):
    first = data[pos]
    pos += 1
    if first < 0x80:
        return first, pos
    nbytes = first & 0x7F
    return int.from_bytes(data[pos : pos + nbytes], "big"), pos + nbytes

def _der_value(data, pos, tag):
    if data[pos] != tag:
        raise ValueError(f"bad DER tag: expected 0x{tag:02x}, got 0x{data[pos]:02x}")
    length, pos = _der_len(data, pos + 1)
    return data[pos : pos + length], pos + length

def _der_int(data, pos):
    raw, pos = _der_value(data, pos, 0x02)
    return int.from_bytes(raw.lstrip(b"\x00"), "big"), pos

def rsa_public_numbers_from_pem(pem):
    b64 = "".join(line for line in pem.splitlines() if not line.startswith("-----"))
    der = base64.b64decode(b64)
    outer, pos = _der_value(der, 0, 0x30)
    _, pos = _der_value(outer, 0, 0x30)
    bit_string, pos = _der_value(outer, pos, 0x03)
    rsa_seq, pos = _der_value(bit_string[1:], 0, 0x30)
    modulus, pos = _der_int(rsa_seq, 0)
    exponent, pos = _der_int(rsa_seq, pos)
    return modulus, exponent

def rsa_encrypt_pkcs1v15(message, pem=TTS_SIGN_PUBLIC_KEY_PEM):
    modulus, exponent = rsa_public_numbers_from_pem(pem)
    key_len = (modulus.bit_length() + 7) // 8
    msg = message.encode("utf-8") if isinstance(message, str) else bytes(message)
    ps_len = key_len - len(msg) - 3
    ps = bytearray()
    while len(ps) < ps_len:
        chunk = secrets.token_bytes(ps_len - len(ps))
        ps.extend(b for b in chunk if b != 0)
    encoded = b"\x00\x02" + bytes(ps[:ps_len]) + b"\x00" + msg
    encrypted = pow(int.from_bytes(encoded, "big"), exponent, modulus).to_bytes(key_len, "big")
    return base64.b64encode(encrypted).decode("ascii")

def make_tts_payload_sign(ssml, extra_info, device_id, app_id):
    ssml_md5 = hashlib.md5(ssml.encode("utf-8")).hexdigest()
    sign_input = f"appid:{app_id}&did:{device_id}&creditDisable:false&ssml:{ssml_md5}"
    if extra_info is not None:
        sign_input += f"&extraInfo:{extra_info}"
    return rsa_encrypt_pkcs1v15(sign_input)

def make_sign_header(url, appvr, device_time, tdid, pf):
    path = url.split("?", 1)[0]
    sign_str = f"9e2c|{path[-7:]}|{pf}|{appvr}|{device_time}|{tdid}|11ac"
    return hashlib.md5(sign_str.encode("utf-8")).hexdigest()

def make_trace_id():
    seed = uuid.uuid4().hex[:32]
    return f"00-{seed}-{seed[:16]}-01"

def escape_xml(text):
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )

def common_query(device, babi_param=None, include_region=True):
    q = {
        "app_name": device["app_name"],
        "device_type": device["device_type"],
        "os_version": device["os_version"],
        "channel": device["channel"],
        "version_name": device["version_name"],
        "device_brand": device["device_brand"],
        "device_id": device["device_id"],
        "iid": device["iid"],
        "version_code": device["version_code"],
        "device_platform": device["device_platform"],
        "aid": device["aid"],
    }
    if include_region:
        q["region"] = device["region"]
    return q

def base_headers(device, body_text):
    now = str(int(time.time()))
    return {
        "content-type": "application/json",
        "appvr": device["appvr"],
        "ch": device["channel"],
        "device-time": now,
        "lan": device["lan"],
        "loc": device["loc"],
        "pf": device["pf"],
        "sign-ver": "1",
        "tdid": device["tdid"],
        "x-ss-stub": make_x_ss_stub(body_text),
        "x-ss-dp": device["aid"],
        "x-khronos": now,
        "x-tt-trace-id": make_trace_id(),
        "user-agent": "Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03",
        "accept-encoding": "gzip, deflate",
        "store-country-code": device["loc"].lower(),
        "store-country-code-src": "did",
        "is-dispatch-us-ttp": "0",
        "is-app-region-us-ttp": "0",
    }

def text_to_audio(text: str, voice: str, resource_id: str, rate: float, output_path: str) -> bool:
    apply_device_ids()
    babi = {
        "feature_entrance": "editor",
        "feature_entrance_detail": "editor-feature-text_to_speech",
        "feature_key": "text_to_speech",
        "scenario": "video_editor",
    }
    
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">\n'
        f'    <voice name="{voice}" mock_tone_info="" platform="sami" '
        f'resource_id="{resource_id}" emotion="" emotion_scale="0" style="" role="" '
        f'moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">\n'
        f'        <prosody rate="{rate}">{escape_xml(text)}</prosody>\n'
        f'    </voice>\n'
        '</speak>'
    )
    
    extra_info = compact_json({"benefit_info": {}})
    payload = {
        "audio_format": "mp3",
        "babi_param": compact_json(babi),
        "credit_disable": False,
        "extra_info": extra_info,
        "need_merge_voice": False,
        "need_subtitle_timestamp": False,
        "scene": "text_to_speech",
        "ssml": ssml,
    }
    
    result = None
    last_errmsg = "Unknown error"
    max_submit_attempts = 4
    for submit_attempt in range(max_submit_attempts):
        payload["sign"] = make_tts_payload_sign(ssml, extra_info, DEVICE["device_id"], DEVICE["aid"])
        body = {
            "bind_id": str(uuid.uuid4()),
            "can_queue": True,
            "enter_from": "text_to_speech",
            "tasks": [
                {
                    "context": str(uuid.uuid4()),
                    "payload": compact_json(payload),
                    "req_key": "sami_text_to_speech",
                    "task_version": "v3",
                }
            ],
        }
        body_text = compact_json(body)
        query = common_query(DEVICE, include_region=True)
        query["babi_param"] = compact_json(babi)
        url = f"{BASE_URL}/lv/v1/common_task/new?{urlencode(query)}"
        headers = base_headers(DEVICE, body_text)
        headers["appid"] = DEVICE["aid"]
        headers["app-sdk-version"] = DEVICE["appvr"]
        headers["sign"] = make_sign_header(url, DEVICE["appvr"], headers["device-time"], DEVICE["tdid"], DEVICE["pf"])
        resp = requests.post(url, headers=headers, data=body_text.encode("utf-8"), timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Submit request failed with HTTP {resp.status_code}: {resp.text}")
        result = resp.json()
        if result.get("ret") == "0":
            break
        last_errmsg = result.get("errmsg", "Unknown error")
        if "shark block" in last_errmsg.lower() and submit_attempt < max_submit_attempts - 1:
            apply_device_ids(rotate=True)
            continue
        raise Exception(f"TTS API failed: {last_errmsg}")
    if not result or result.get("ret") != "0":
        raise Exception(f"TTS API failed: {last_errmsg}")
    task_data = result["data"]["tasks"][0]
    task_id = task_data["id"]
    token = task_data["token"]
    qbody = {
        "tasks": [
            {
                "bind_id": "",
                "id": task_id,
                "req_key": "sami_text_to_speech",
                "task_version": "v3",
                "token": token
            }
        ]
    }
    qbody_text = compact_json(qbody)
    qquery = common_query(DEVICE, include_region=False)
    qurl = f"{BASE_URL}/lv/v1/common_task/query?{urlencode(qquery)}"
    
    headers_q = base_headers(DEVICE, qbody_text)
    headers_q["appid"] = DEVICE["aid"]
    headers_q["app-sdk-version"] = DEVICE["appvr"]
    headers_q["sign"] = make_sign_header(qurl, DEVICE["appvr"], headers_q["device-time"], DEVICE["tdid"], DEVICE["pf"])
    audio_url = None
    max_attempts = 60
    for attempt in range(max_attempts):
        time.sleep(1)
        resp_q = requests.post(qurl, headers=headers_q, data=qbody_text.encode("utf-8"), timeout=30)
        if resp_q.status_code != 200:
            continue
            
        qresult = resp_q.json()
        if qresult.get("ret") != "0":
            continue
            
        task_q = qresult["data"]["tasks"][0]
        status = task_q.get("status")
        
        if status in ("succeed", "success"):
            payload_str = task_q.get("payload")
            payload_data = json.loads(payload_str)
            audio_subtitles = payload_data.get("audio_subtitles", [])
            if audio_subtitles:
                audio_url = audio_subtitles[0].get("speech_url")
            break
        elif status == "failed":
            raise Exception("Task processing failed on the server side.")
            
    if not audio_url:
        raise Exception("Timed out waiting for TTS task to succeed.")
    audio_resp = requests.get(audio_url, timeout=30)
    audio_resp.raise_for_status()
    
    with open(output_path, "wb") as f:
        f.write(audio_resp.content)
        
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python capcut_tts.py <text_file_path> <output_mp3_path> <voice_type> [resource_id] [speed]")
        sys.exit(1)
    text_file = sys.argv[1]
    output_path = sys.argv[2]
    voice = sys.argv[3]
    
    resource_id = None
    speed_val = 1.0
    if len(sys.argv) == 5:
        arg4 = sys.argv[4]
        try:
            speed_val = float(arg4)
        except ValueError:
            resource_id = arg4
    elif len(sys.argv) >= 6:
        resource_id = sys.argv[4]
        speed_val = float(sys.argv[5])
    
    if not resource_id:
        resource_id = "7102355709945188865" # Default to "Cô Gái Hoạt Ngôn"
        
    try:
        with open(text_file, "r", encoding="utf-8") as f:
            text_content = f.read().strip()
        if not text_content:
            print("TTS ERROR: Empty text content")
            sys.exit(1)
            
        ok = text_to_audio(text_content, voice, resource_id, speed_val, output_path)
        if ok:
            print("TTS SUCCESS")
        else:
            print("TTS ERROR: Failed")
            sys.exit(1)
    except Exception as e:
        print(f"TTS ERROR: {e}")
        sys.exit(1)
