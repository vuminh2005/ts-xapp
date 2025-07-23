3 file chính:
- index.html, style.css: giao diện
- script.js: logic

3 file phụ:
- temp.js: lưu giữ logic gốc - vị trí UE ngẫu nhiên
- better-offload.js: vị trí UE cố định, trường hợp dùng policy OFFLOAD sẽ nhanh hơn (script.js đang sử dụng code này)
- better-default.js: vị trí UE cố định, trường hợp dùng policy DEFAULT sẽ nhanh hơn
