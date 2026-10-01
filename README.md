# Rootline · Family Tree Editor

`family-tree-editor` là CMS offline và source of truth cho gia phả. Ứng dụng chạy hoàn toàn trong trình duyệt: không backend, database, API, đăng nhập, tracking hay upload ảnh.

## Chạy local

Web Crypto và import/export file cần một origin HTTP. Từ thư mục `family-tree-editor`:

```bash
python3 -m http.server 8080
```

Mở <http://localhost:8080/>. Không cần npm, build step hay internet để chỉnh sửa dữ liệu. Giao diện không cần tải font hay tài nguyên từ internet.

## Quy trình cập nhật gia phả

1. Mở Editor local.
2. Nhập `family.json` hoặc `data.enc` cũ nếu có.
3. Chỉnh sửa thành viên, quan hệ, root person và metadata gia đình.
4. Mở **Kiểm tra dữ liệu** và xử lý toàn bộ lỗi nghiêm trọng.
5. Chuẩn bị ảnh trong `family-tree-viewer/assets/members/`.
6. Xuất `data.enc`, nhập mật khẩu hai lần.
7. Copy file `data.enc` sang thư mục gốc của `family-tree-viewer`.
8. Kiểm tra Viewer rồi commit/push thay đổi.

Editor giữ undo/redo tối đa 80 trạng thái. Khi còn thay đổi chưa xuất, trình duyệt sẽ cảnh báo trước khi đóng hoặc reload trang.

## Dữ liệu và import/export

Schema hiện tại là `schemaVersion: 1`:

```json
{
  "schemaVersion": 1,
  "family": {
    "name": "Gia phả họ Nguyễn",
    "description": "...",
    "rootPersonId": "p001"
  },
  "members": [
    {
      "id": "p001",
      "fullName": "Nguyễn Văn Minh",
      "gender": "male",
      "birthDate": "1990-05-12",
      "deathDate": null,
      "birthPlace": "Hà Nội",
      "occupation": "...",
      "generation": 2,
      "fatherId": null,
      "motherId": null,
      "spouseIds": [],
      "siblingOrder": 1,
      "note": ""
    }
  ]
}
```

ID được Editor tự sinh khi thêm người. Có thể nhập JSON plaintext để backup; Editor validate ngay sau import và không âm thầm sửa lỗi quan hệ nguy hiểm.

### Thế hệ và đẩy thế hệ

Trong form thêm/chỉnh sửa thành viên, **Thế hệ** là số nguyên dương 1-based tùy chọn. Nếu bỏ trống, Editor tiếp tục suy ra thế hệ từ quan hệ cha/mẹ. Khi nhập thế hệ và tích **Đẩy thế hệ sau**, lúc lưu Editor sẽ tăng 1 cho mọi thành viên từ chính thế hệ đã nhập trở đi; thay đổi được ghi thành một giao dịch Undo/Redo và không sửa quan hệ, ID hay `siblingOrder`.

Nút **Đẩy toàn bộ thế hệ** vẫn là thao tác nhanh để tăng `family.generationOffset` cho toàn bộ sơ đồ. Offset chỉ thay đổi cách hiển thị, được export/import và không thay đổi thế hệ cơ sở hay `rootPersonId`.

Nút **Lưu lại** lưu bản JSON hiện tại vào bộ nhớ tạm của trình duyệt (`localStorage`), không tạo file tải xuống và không thay thế thao tác xuất `family.json` hoặc `data.enc`. Khi mở lại Editor, bản lưu tạm hợp lệ sẽ được khôi phục tự động.

`data.enc` dùng cùng format với Viewer hiện tại: PBKDF2-SHA-256 với salt ngẫu nhiên, AES-256-GCM với IV ngẫu nhiên, cùng envelope `v: 1`. File export có trường `auth.username: "donghothe"` để tương thích với màn hình đăng nhập của Viewer. Mật khẩu nhập khi mã hóa `data.enc` chính là mật khẩu đăng nhập Viewer tương ứng; mật khẩu không bao giờ được lưu trong dữ liệu, localStorage, IndexedDB hay console.

JSON plaintext chỉ dùng làm backup an toàn, không đưa lên repository public. `data.enc` có thể nằm trong Viewer public vì nội dung vẫn được mã hóa; mật khẩu vẫn cần được giữ riêng.

## Ảnh thành viên

Editor không lưu binary ảnh, base64, Blob hay ArrayBuffer và không có file picker upload. Ảnh được chuẩn bị thủ công tại:

```text
family-tree-viewer/assets/members/
```

Filename duy nhất được tạo bởi `getMemberImageFilename(member)`:

```text
Nguyễn Văn Minh + 1990-05-12 → nguyenvanminh1990.webp
Trần Thị Thu + 1965-01-01   → tranthithu1965.webp
```

Tên được Unicode normalize, bỏ dấu tiếng Việt, chuyển lowercase, bỏ khoảng trắng/ký tự filename không hợp lệ rồi nối năm sinh và `.webp`. Khi thiếu năm sinh, Editor báo warning thay vì tạo `undefined`, `null` hoặc `NaN`. Filename collision cũng là warning và không tự thêm `_1`, `_2` hay ID.

Quan hệ **anh/chị/em ruột** được lưu bằng `siblingIds` đối xứng; cả Editor và Viewer đều tự nhận diện anh/chị/em dùng chung cha hoặc mẹ, vẽ kết nối riêng trên sơ đồ và hiển thị trong hồ sơ thành viên.

Ảnh trong `assets/members/` là static asset public của GitHub Pages. Ảnh không được mã hóa cùng `data.enc`, vì vậy không đặt ảnh cần riêng tư tuyệt đối vào thư mục đó.

## Validation

Editor kiểm tra duplicate ID, missing references, self-parent, self-spouse, circular parent relationship, ngày không hợp lệ, death before birth, spouse không đối xứng, root không hợp lệ, empty name, malformed data, thiếu năm sinh và image filename collision. `ERROR` chặn export; `WARNING` được hiển thị rõ nhưng vẫn cho phép export.

## Tương tác

- Tree SVG tự layout theo parent/child/spouse, không hard-code vị trí thành viên.
- Pan, wheel zoom, pinch zoom, fit tree và double-tap mobile.
- Single click chọn người; double-click mở form chỉnh sửa.
- Tìm kiếm không dấu, click member/relative/generation đều focus camera.
- Generation rail có scroll riêng và tự tính từ graph.
- `Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z`, `Ctrl/Cmd + K`, Enter và Escape được hỗ trợ.
- Responsive riêng cho màn hình mobile 360/390/412px; detail chuyển thành bottom sheet.

## Không được upload public

Không commit JSON gia phả plaintext, backup chưa mã hóa, mật khẩu, ghi chú có mật khẩu hoặc ảnh cần bảo mật tuyệt đối. Chỉ data đã mã hóa và static assets mà gia đình chấp nhận public mới được copy sang Viewer.


### Thứ tự anh/chị/em

`member.siblingOrder` là số nguyên dương trong từng nhóm anh/chị/em. Số nhỏ hơn đứng trước và được sắp xếp từ trái sang phải; giá trị này độc lập với generation/generationOffset. Nếu thiếu hoặc không hợp lệ, ứng dụng không hiển thị badge và không tự đoán thứ tự.


`generation` là thế hệ cơ sở 1-based tùy chọn; nếu bỏ trống, graph suy ra từ cha/mẹ. Trong Editor, checkbox **Đẩy thế hệ sau** sẽ tăng 1 cho các member từ chính thế hệ đang nhập trở đi và được lưu trong Undo/Redo. `generationOffset` chỉ là offset hiển thị toàn cục.
