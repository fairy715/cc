# Tasks

## Someday

- [ ] **DJI Mavic 居家保全無人機** — https://x.com/0xCodez/status/2114762819371680110
  - 2026-10-27 標記，之後再來做
  - 概念：警報觸發 → 手機推播一鍵起飛 → 無人機用手機上的模型辨識並追蹤入侵者 → 到地界停下、爬升觀察 → 返航降落，影片存在手機。全程不上雲，跑在接遙控器的備用手機上
  - 作者的步驟：
    1. 備用手機接上 Mavic 遙控器，在 Claude Code 貼上作者的 prompt
    2. 先比對機型是否在 DJI Mobile SDK v5 支援清單；不在就停，不碰韌體
    3. 用官方 DJI SDK 寫小 app：iPhone 用 Swift、Android 用 Kotlin
    4. 串 Home Assistant 警報 → 推播到手機 → 一鍵「Launch」
    5. 辨識：手機上跑小型 YOLO（iPhone 用 Core ML、Android 用 LiteRT）
    6. 追蹤記憶：Kalman filter，狀態 LOCKED → COASTING → 用同一個 ID 重新鎖定
    7. 控制：Virtual Stick 10 Hz，框的中心控制偏航、框的大小控制距離，最近 8 m
    8. 到地界停住，爬升到 30 m，鏡頭持續對準直到目標離開視線
    9. 返航降落在停機墊，含軌跡、距離、時間戳的影片已經在手機上
  - 待補：截圖沒有作者的完整 prompt 跟貼文後面那篇逆向工程文章，開工時要從原貼文拿
  - 開工前先確認：
    - 手上的 DJI 機型有沒有支援 MSDK v5
    - 台灣的無人機法規（民航局遙控無人機規定：夜間飛行、目視範圍外、自動飛行要不要申請）
    - 個資與隱私：拍攝、追蹤他人可能有法律問題
    - 安全設計：最近距離、地理圍欄、失聯返航、手動接管
