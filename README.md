# كادري | سوشي وحواوشي

واجهة طلبات عربية RTL مبنية بـ React وVite، مع Web API بـ ASP.NET Core 10 وSQLite عبر Entity Framework Core. لا توجد قائمة منتجات تجريبية مضمنة في الواجهة؛ الأصناف والأسعار والتوفر تُقرأ من قاعدة البيانات.

## المتطلبات

- Node.js 22 أو أحدث.
- .NET SDK 10.
- لا يحتاج تشغيل التطوير المحلي إلى تثبيت أو تشغيل خادم قاعدة بيانات؛ SQLite تحفظ البيانات في ملف محلي.
- إعدادات S3-compatible storage وPaymob فقط عند تفعيل رفع الصور للإنتاج والدفع بالبطاقة.

## تشغيل الواجهة

من مجلد المشروع:

```powershell
npm install
$env:VITE_API_URL = "http://localhost:5080/api"
npm run dev
```

افتح `http://localhost:5173`. البناء والتحقق:

```powershell
npm run build
npm run lint
```

## تشغيل API محليًا باستخدام SQLite

قاعدة التطوير الافتراضية هي `kadry.db` في مجلد بيانات المستخدم المحلي (على Windows: `%LOCALAPPDATA%\Kadry\kadry.db`). لا تحتاج إلى SQL Server أو خدمة منفصلة. يُقرأ مسار قاعدة البيانات من `appsettings.Development.json`، ويحوّله التطبيق وأداة EF Core إلى المسار نفسه. ملف قاعدة البيانات مستثنى من Git.

من PowerShell في جذر المشروع، استعد الاعتماديات وثبّت أداة EF Core وأنشئ قاعدة البيانات من migrations:

```powershell
$project = ".\backend\Kadry.Api\Kadry.Api.csproj"
dotnet restore $project
dotnet tool install --global dotnet-ef --version 10.0.13
dotnet ef database update --project $project
```

إذا كانت أداة `dotnet-ef` مثبتة مسبقًا، تخطَّ أمر تثبيتها. يتطلب تشغيل API مفتاح JWT محليًا؛ أنشئه مرة واحدة باستخدام User Secrets (لا تحفظه في ملفات المشروع):

```powershell
$jwtSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
dotnet user-secrets set "Authentication:JwtSecret" $jwtSecret --project $project
```

ابدأ API:

```powershell
dotnet run --project $project
```

ثم في نافذة PowerShell أخرى اختبر نقطة المنتجات:

```powershell
Invoke-RestMethod -Uri "http://localhost:5080/api/products"
```

تعيد النقطة قائمة المنتجات الموجودة، وقد تكون فارغة إلى أن تضيف منتجات من لوحة الإدارة. تُنشأ التصنيفات الأساسية تلقائيًا، لكن لا يُنشئ التطبيق منتجات تجريبية. كما يطبّق API أي migrations معلّقة عند بدء التشغيل؛ أمر `dotnet ef database update` أعلاه يتيح تطبيقها صراحةً قبل التشغيل.

لإنشاء migration بعد تعديل النماذج:

```powershell
dotnet ef migrations add DescribeYourChange --project $project
```

كانت migration الحالية مولّدة لـ SQL Server وتتضمن أنواعًا وبيانات وصفية خاصة به، لذلك استُبدلت بـ migration مولّدة لمزود SQLite؛ لم يُحذف أي نموذج أو جدول من التطبيق. قاعدة SQL Server سابقة لا تتحول تلقائيًا إلى SQLite، ولا تُحذف أو تُنقل بياناتها بهذه الخطوة.

SQLite خيار بسيط وعملي للتطوير المحلي وقد يناسب نشرًا صغيرًا منخفض التزامن. قبل الإطلاق، قيّم استضافة ملف قاعدة البيانات، والنسخ الاحتياطي، والتوفر، وحجم الطلبات المتزامنة؛ قد يكون محرك خادمي أنسب عند تعدد نسخ التطبيق أو كثرة عمليات الطلب والكتابة.

### إنشاء أول حساب مدير

لا يوجد تسجيل عام للمديرين. اترك API يعمل في النافذة الأولى، وافتح نافذة PowerShell ثانية، ثم أنشئ رمز التهيئة المؤقت واحتفظ به لاستخدامه مرة واحدة:

```powershell
$project = ".\backend\Kadry.Api\Kadry.Api.csproj"
$bootstrapToken = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
dotnet user-secrets set "Bootstrap:Token" $bootstrapToken --project $project
Write-Host "احفظ هذا الرمز مؤقتًا لاستخدامه أدناه: $bootstrapToken"
```

بعد حفظ الرمز، أوقف API وشغّله مجددًا كي يقرأ الإعداد. ثم أرسل الرمز وبيانات المدير:

```powershell
$bootstrapToken = Read-Host "أدخل رمز التهيئة المؤقت"
$body = @{
  username = "restaurant-admin"
  password = "ضع-كلمة-مرور-طويلة-وفريدة-هنا"
  bootstrapToken = $bootstrapToken
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/admin/auth/bootstrap" -ContentType "application/json" -Body $body
```

يُقبل إنشاء حساب واحد فقط، ويتطلب كلمة مرور من 12 حرفًا على الأقل، وتُخزّن باستخدام `PasswordHasher`. بعد الإنشاء، أوقف API واحذف رمز التهيئة من User Secrets:

```powershell
dotnet user-secrets remove "Bootstrap:Token" --project .\backend\Kadry.Api\Kadry.Api.csproj
```

لا تضع الرمز أو الأسرار في ملفات المشروع أو مستودع Git.

### تسجيل الدخول وإضافة أول منتج

1. بعد إنشاء حساب المدير أعلاه، افتح `http://localhost:5173/admin` وسجّل الدخول باسم المستخدم وكلمة المرور اللذين اخترتهما. إذا لم تكن الواجهة تعمل، شغّل `npm run dev` من جذر المشروع.
2. افتح تبويب **المنتجات** ثم اضغط **إضافة منتج**.
3. اختر صورة JPG أو PNG أو WebP (حتى ٥ ميجابايت)، واكتب الاسم بالعربية والوصف والسعر بالجنيه، ثم اختر التصنيف.
4. اترك **متاح للطلب** مفعّلًا كي يظهر المنتج للزبائن، أو ألغِ تحديده لحفظه مخفيًا. اضغط **حفظ المنتج**.
5. افتح `http://localhost:5173/menu` أو حدّث صفحة المنيو؛ المنتجات المتاحة تُحمّل من قاعدة البيانات وتظهر هناك تلقائيًا. إخفاء المنتج أو إخفاء تصنيفه يمنع ظهوره وقبوله في الطلبات.

يمكن تعديل المنتج أو حذفه من الجدول نفسه. الحذف من لوحة التحكم حذف منطقي، لذلك لا يمسح سجل المنتجات التي ربما ارتبطت بطلبات سابقة.

## الصور

في بيئة التطوير فقط، يمكن رفع الصور محليًا إلى `wwwroot/uploads`. لا يُستخدم هذا التخزين في الإنتاج.
تُحل روابط الصور النسبية باستخدام أصل الخادم المحدد في `VITE_API_URL`، بينما تبقى روابط CDN المطلقة كما هي. عند استخدام واجهة على أصل مختلف، أضف أصل الواجهة إلى `CORS_ALLOWED_ORIGINS`؛ الخادم يقدّم الصور عبر static files من `wwwroot`.

في الإنتاج، اضبط متغيرات البيئة التالية لمخزن S3-compatible دائم (مثل S3 أو R2)، واستخدم CDN/سياسة bucket للقراءة العامة بدل ACL:

```text
Storage__Provider=S3
Storage__S3__Bucket=اسم-bucket
Storage__S3__Region=eu-central-1
Storage__S3__PublicBaseUrl=https://cdn.example.com
Storage__S3__ServiceUrl=اختياري-لمخزن-S3-compatible
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

تقبل نقطة الرفع JPEG وPNG وWebP فقط، وتتحقق من ترويسة الملف الفعلية، والحجم الأقصى 5 MiB، وتولّد اسمًا عشوائيًا لا يعتمد على اسم الملف المرسل.

## Paymob

الدفع بالبطاقة يبقى غير مفعّل حتى تُضبط بيانات حساب Paymob. استخدم مفاتيح Sandbox أولًا، واجعل عنواني العودة والإشعار HTTPS متاحين للخادم:

```text
Paymob__SecretKey=...
Paymob__PublicKey=...
Paymob__HmacSecret=...
Paymob__PaymentMethodIds__0=معرّف-طريقة-الدفع-من-لوحة-Paymob
Paymob__NotificationUrl=https://api.example.com/api/payments/webhook
Paymob__RedirectionUrl=https://shop.example.com
```

ينشئ الخادم Intention لدى Paymob ويعيد رابط Unified Checkout؛ لا تمر بيانات البطاقة عبر الموقع. يضيف API رقم الطلب إلى عنوان العودة أعلاه. لا يُسجّل الدفع كمدفوع عند عودة العميل، بل فقط بعد التحقق من HMAC ومطابقة المبلغ ورقم الطلب في webhook. الطلبات المكررة لنفس معرّف معاملة Paymob لا تُنشئ قيود دفع إضافية. اختبر حالات النجاح والفشل والإلغاء والإشعار المكرر في حساب Sandbox قبل نشر بيانات الإنتاج. تظل خدمة الدفع بالكاش مستقلة.

## نقاط API المهمة

- عامة: `GET /api/categories`, `GET /api/products`, `GET /api/products/{id}`, `POST /api/orders`, `GET /api/orders/track/{orderNumber}`.
- الدفع: `POST /api/payments/{orderNumber}/checkout`, `POST /api/payments/webhook`.
- دخول الإدارة: `POST /api/admin/auth/bootstrap` (مرة واحدة) و`POST /api/admin/auth/login`.
- محمية بـ JWT: `/api/admin/dashboard`, `/api/admin/categories`, `/api/admin/products`, `/api/admin/orders`, `/api/admin/uploads/images`.

كل عمليات الإدارة محمية على الخادم. يحسب الخادم الأسعار والخصومات ورسوم التوصيل من البيانات الحالية، ولا يعتمد على إجماليات الواجهة. تغيير حالة الطلب لا يغيّر حالة الدفع؛ لا يمكن إتمام طلب Visa قبل التحقق من webhook.

## إعدادات التشغيل

- `ConnectionStrings__DefaultConnection`: سلسلة اتصال SQLite دائمة؛ في التطوير تُضبط في `appsettings.Development.json`.
- `Authentication__JwtSecret`: مفتاح JWT سري بطول 32 بايت على الأقل (مطلوب).
- `Bootstrap__Token`: رمز عشوائي مؤقت لإنشاء أول مدير.
- `DeliveryFee`: رسوم التوصيل بالجنيه؛ القيمة الحالية في `appsettings.json` هي قيمة تطوير يجب ضبطها للمطعم.
- `CORS_ALLOWED_ORIGINS`: قائمة origins مفصولة بفواصل منقوطة للواجهة المنشورة.
- `VITE_API_URL`: عنوان API للواجهة المنشورة.

في الإنتاج، استخدم HTTPS، وخزّن الأسرار في مدير أسرار المنصة أو متغيرات بيئة آمنة. لا تضع JWT أو Paymob في ملفات الواجهة أو مستودع Git، وقيّم ملاءمة SQLite ومتطلبات التزامن والاستضافة قبل الإطلاق.

## ما يحتاج إعدادًا خارجيًا قبل الإطلاق

- اختيار قاعدة بيانات الإنتاج وتقييم ملاءمة SQLite لمتطلبات الاستضافة والتزامن، وضبط الاتصال وCORS والدومينات الفعلية.
- إدخال المنتجات والصور والأسعار الحقيقية من لوحة الإدارة.
- ضبط رسوم التوصيل ورقم التواصل والعنوان الفعليين للمطعم.
- إعداد مخزن صور دائم وCDN في الإنتاج.
- توفير بيانات Paymob، ومعرّفات طرق الدفع، وعناوين webhook/return عامة عبر HTTPS، ثم اختبار Sandbox.
- إعداد مراقبة وتنبيهات ونسخ احتياطية لقاعدة البيانات في بيئة النشر.
