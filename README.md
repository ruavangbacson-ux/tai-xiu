# Tài Xỉu Arena — backend nhiều người chơi (điểm ảo)

## Yêu cầu
- Node.js 18 trở lên
- Kết nối Internet chỉ cần để cài package (không cần cho game sau khi cài)

## Chạy trên máy tính
1. Giải nén thư mục.
2. Mở Terminal/CMD tại thư mục có `package.json`.
3. Chạy:
   ```bash
   npm install
   npm start
   ```
4. Mở `http://localhost:3000`.
5. Mở thêm tab/cửa sổ trình duyệt hoặc một thiết bị khác trong cùng mạng để thử đồng bộ.

## Thử từ điện thoại trong cùng Wi-Fi
- Tìm địa chỉ IP nội bộ của máy tính (ví dụ `192.168.1.20`).
- Trên điện thoại mở `http://192.168.1.20:3000`.
- Cho phép Node.js qua firewall nếu hệ điều hành hỏi.
- Không mở cổng router hay đưa lên Internet công cộng khi chưa có HTTPS và bảo mật phù hợp.

## Chức năng
- Đăng ký/đăng nhập demo, mật khẩu băm bằng bcryptjs.
- Điểm ảo khởi tạo 1.000.000 cho tài khoản mới.
- Kết quả được tạo ở server; tất cả client nhìn thấy cùng phiên/kết quả.
- Một cược/tài khoản/phiên; chat chung; lịch sử kết quả.
- Dữ liệu tài khoản, số dư và lịch sử demo lưu trong `data/state.json`.

## Giới hạn quan trọng
- Đây là mã mẫu học tập, KHÔNG phải hệ thống production.
- Phiên đăng nhập lưu trong RAM nên mất hiệu lực khi khởi động lại server.
- Không có nạp/rút tiền, chuyển điểm, quy đổi điểm hoặc tích hợp thanh toán.
- Chưa có rate limiting, email xác minh, khôi phục mật khẩu, quản trị thật, giám sát hoặc chống tấn công đầy đủ.
- Nếu triển khai Internet: bắt buộc bổ sung HTTPS, cookie/session hoặc token có vòng đời, rate limiting, validation, backup, logging, kiểm thử bảo mật và rà soát pháp lý. Không dùng demo này để vận hành cá cược tiền thật.
