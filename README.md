# HunterKit Web 1.12.0 — Security Testing, Penetration Testing & Intelligent Analysis

نسخة إصلاح ومراجعة شاملة للمشروع المرفق. التفاصيل الفنية ونتائج التحقق في [تقرير الإصلاح](FIX-REPORT.ar.md).

## التشغيل على Windows x64

1. فك ZIP في مجلد جديد. احتفظ بنسخة احتياطية من مجلد `projects` القديم.
2. ثبّت **Node.js 20.18 أو أحدث** وChrome أو Edge للصور.
3. شغّل `INSTALL-TOOLS.cmd` وانتظر اكتمال الخطوات الخمس بدون أخطاء.
4. شغّل `START-HUNTERKIT.cmd` واترك النافذة مفتوحة.
5. افتح العنوان الذي يطبعه السكربت: المنفذ الافتراضي للواجهة 5173 وللـ API هو 4000.

الأدوات وقوالب Nuclei تُنزّل وقت التثبيت؛ ملف ZIP لا يحتوي `node_modules` أو ملفات EXE. التنزيلات مثبتة بإصدارات وSHA-256 في `scripts/tools-lock.json` و`scripts/templates-lock.json`. لا يحتاج المثبّت GitHub token أو GitHub API. يحتاج الوصول إلى npm registry وgithub.com وcodeload.github.com ووجهة ملفات إصدارات GitHub.

لو بتنقل مشاريع قديمة: انسخ مجلد كل مشروع إلى `projects/` بعد التثبيت. المشاريع القديمة التي خزّنت اسم المضيف فقط لا يمكن استعادة port/path ضاع منها تلقائيًا؛ أنشئ مشروعًا جديدًا بعنوان المعمل الكامل.

## التشغيل على Linux x64

```bash
bash INSTALL-TOOLS.sh
bash START-HUNTERKIT.sh
```

أو من جذر المشروع:

```bash
npm run setup
npm run dev
```

لتشغيل نسخة production:

```bash
npm run build
npm start
```

الـ backend يخدم الواجهة المبنية على المنفذ 4000. لا تجعل الخدمة مكشوفة للإنترنت؛ التطبيق مصمم للتشغيل المحلي.

## معمل عرض ثابت للمناقشة

على Windows افتح `START-DEMO-LAB.cmd` في نافذة منفصلة، أو شغّل `npm run demo:lab` على أي نظام. سيطبع رابطًا محليًا عشوائي المنفذ مثل `http://localhost:12345/lab/`. اترك نافذة المعمل مفتوحة، وأنشئ مشروع HunterKit بهذا الرابط الكامل، ثم شغّل Full Recon وParameters وبعدها أدوات Attack واحدة تلو الأخرى.

المعمل يستمع على loopback فقط، ويحتوي signatures مقصودة وGET parameters لـPanels/Default Login/Takeover/Exposures/CVEs/LFI/SQLi/XSS حتى يكون العرض قابلًا للتكرار بدون الاعتماد على الإنترنت. هو محاكاة تحقق لتكامل الأدوات وليس منتجًا حقيقيًا مصابًا أو دليلًا على عدد ثغرات حقيقية.

## إدخال الهدف

- `example.com`: اكتشاف HTTP وHTTPS وsubdomains داخل النطاق.
- `http://localhost:8080/lab/`: نفس الأصل، مع الاحتفاظ بالـ port والمسار.
- `http://localhost:8080/lab/sqli?id=1`: الرابط نفسه يدخل مباشرة في فحوص البارامترات.
- الروابط الكاملة ذات scheme صريح تُعامل كنطاق أصل محدد، بما فيه المنفذ. لا تُضاف روابط أطراف ثالثة من HTML أو الأرشيف لمدخلات الهجمات.
- استخدم أهدافًا تملكها أو لديك تصريح بفحصها. اختبارات المشروع المرفقة تتصل بخادم loopback مؤقت فقط.

## طريقة العمل

```text
React / Vite
  -> frontend/src/web-ipc.ts
  -> POST /api/ipc/<channel>
  -> backend/src/server.ts
  -> backend/src/core.ts
  -> Recon / Security Testing / Penetration Testing / Intelligent Analysis
  -> أدوات CLI محلية + فحوص HTTP/TLS أصلية
  -> projects/<name>/{results, logs, details.json}
  -> Results / Attack
```

لا يوجد Electron runtime ولا قاعدة بيانات في هذه النسخة. البيانات ملفات JSON وTXT لكل مشروع.

ابدأ بـ Create Project، وأكد أنك تملك الهدف أو لديك تصريح مكتوب لاختباره؛ يحفظ HunterKit النطاق ووقت التأكيد ويمنع الاختبارات النشطة بدونه. بعد ذلك شغّل RECON → Run Full Recon، ثم Security Testing، ثم Penetration Testing، وأخيرًا AI Analysis لتجميع الأدلة. بعد أي تغيير في صفحات المعمل اضغط Parameters لتحديث روابطه. مكتشف الصفحات محدود بـ12 صفحة ويفهم الروابط ونماذج GET، ولا ينفذ JavaScript ولا يسجل الدخول تلقائيًا.

يشغّل HunterKit أداة واحدة فقط لكل مشروع في اللحظة نفسها. أثناء فحص Attack تُعطّل بقية أزرار الهجوم، وأي طلب ثانٍ يصل للـbackend يُرفض فورًا برسالة `busy` بدل وضعه في طابور أو تشغيل عدة محركات تتنافس على الشبكة. انتظر انتهاء الأداة الحالية ثم ابدأ التالية.

| الجزء | الأداة / المسار | المدخل | الناتج |
|---|---|---|---|
| Subdomains | Subfinder | اسم نطاق | `recon_subdomins.txt` |
| Live services | HTTPX + فحص HTTP بديل | URL/hosts | `httpx_live_domains.txt` |
| Archive | WaybackURLs + CDX + Common Crawl | domains | `waybackurls_archive.txt` |
| JS / Parameters | HTML GET discovery + scoped archive | URL inventory | `waybackurls_js.txt`, `waybackurls_parameter.txt` |
| Screenshots | Playwright Core + Chrome/Edge/Chromium المثبت | live URLs | `httpx_screen/screenshot/` |
| JS secrets / endpoints | JSLeak | pages + discovered JS files عبر stdin | `secrets.txt`, `extra_links.txt` |
| General | Nuclei: misconfiguration/exposures/panels | HTTP URLs | `general_scanning.json` |
| Panels | Nuclei: `http/exposed-panels` | HTTP URLs | `exposed_panels.json` |
| Default credentials | Nuclei: `http/default-logins` | HTTP URLs | `default_credentials.json` |
| Takeovers | Nuclei: `http/takeovers` | in-scope URLs | `subdomain_takeovers.json` |
| Exposures | Nuclei: `http/exposures` | HTTP URLs | `exposures.json` |
| CVEs | Nuclei: `http/cves`, medium+ | HTTP URLs | `CVEs.json` |
| LFI | Nuclei DAST: `dast/vulnerabilities/lfi` | parameterized URLs | `LFI.json` |
| SQLi | Nuclei DAST: `dast/vulnerabilities/sqli` | parameterized URLs | `SQLI.json` |
| XSS | Dalfox v3 | parameterized URLs | `XSS.json` |
| AI explanation | Cloudflare، اختياري | finding text | نافذة شرح |

ملف `.env` اختياري؛ انسخه من `.env.example`. بيانات Cloudflare مطلوبة لشرح AI الخارجي فقط، وليست مطلوبة لفحوص Nuclei أو Dalfox.

## قراءة النتائج وتشخيص الصفر

صفحة **Results → Attack** ومسارا Security Testing وAI Analysis يعرضان الأدلة والحالة والمصدر والتاريخ وعدد الطلبات والأخطاء. الحالات النهائية الموحدة هي:

- **COMPLETED_WITH_FINDINGS**: انتهى الفحص وسجل أدلة فعلية.
- **COMPLETED_NO_FINDINGS**: انتهى الفحص ولم يجد دليلًا ضمن المدخلات والقوالب المختارة.
- **PARTIAL**: انتهت المهلة أو توقف المحرك قبل إنهاء الجولة. الأدلة التي وصلت تُحفظ؛ التغطية ناقصة.
- **SKIPPED_NO_INPUTS**: لم يُنفّذ الفحص، مثل غياب روابط البارامترات.
- **FAILED_TOOL_ERROR**: مشكلة واضحة في المدخلات أو الأداة أو القوالب أو الاتصال، مع رسالة خطأ.
- **RUNNING**: تشغيل جارٍ. **LEGACY / UNKNOWN**: بيانات قديمة لا تثبت اكتمال الفحص؛ أعد تشغيله.

الفحص العام لم يعد يعتمد على التعرف على تقنية الموقع. Panels يمكن أن يرجع info detections؛ وجود لوحة دخول ليس إثباتًا لاستغلال ثغرة. XSS يحتسب نتائج Dalfox من نوع **V** فقط؛ R/A/I محفوظة في التقرير الخام كملاحظات منفصلة.

كل module يحتفظ بآخر تشغيل خاص به. إعادة Panels لا تمسح نتيجة قديمة من General؛ جدول النتائج يوضح المصدر والتاريخ حتى لا تختلط التشغيلات.

الفحوص محدودة افتراضيًا: General حتى8 مدخلات، Panels/Exposures/CVEs/LFI حتى10، Default logins حتى5، Takeovers حتى50، SQLi حتى15، XSS حتى25. Nuclei يعمل بحد40 طلب/ثانية مع retry واحد؛ الفحوص الكبيرة General/Panels/Exposures/CVEs لها مهلة300 ثانية، والفحوص المركزة180 ثانية. Dalfox يعمل بحد20 طلب/ثانية ومهلة إجمالية300 ثانية. يمكن تعديل `HUNTERKIT_SCAN_TIMEOUT_MS` في `.env` بين1000 و900000 لتغيير مهلة Nuclei. السكربت `tests/production-smoke.mts` يستخدم30 ثانية افتراضيًا عمدًا لقياس حفظ النتائج الجزئية، ويمكن تمرير مهلة أخرى في متغير البيئة.

للتشخيص:

```bash
npm run check:tools
npm run check:attacks
```

داخل مجلد المشروع:

- `<module>-scan-status.json`: حالة تشغيل قابلة للقراءة.
- `logs/<module>-nuclei.log`: stdout/stderr والإحصاءات.
- `logs/<module>-nuclei.raw.jsonl`: الأدلة الخام قبل تحويلها للعرض.
- `logs/<module>-nuclei-errors.log`: أخطاء الطلبات.
- `logs/XSS-dalfox.log`, `XSS.json`: تقرير Dalfox ومعلومات الاكتمال.
- `current_url_inventory_status.json`: صفحات الاكتشاف وأخطاء جلبها.

`check:tools` يعني أن البرنامج المتوقع يمكن تشغيله. `check:attacks` يحصي الملفات الموجودة قبل فلترة severity/tags/protocol؛ عدد القوالب الفعلي يظهر بعد تشغيل كل فحص.

الأرشيف يعتمد على خدمات خارجية وقد لا يتوفر. أهداف IP/localhost ليست لها بيانات أرشيف عامة ويُتخطى الأرشيف لها. تعمل فحوص البارامترات أيضًا من صفحات الموقع الحالية ونماذج GET. الفحوص لا تدعم تلقائيًا جلسة تسجيل دخول أو SPA أو POST/JSON inputs؛ وجود ثغرة من تلك الأنواع لا يضمن اكتشافها بهذه المدخلات.

## التحقق للمطورين

بعد التثبيت:

```bash
npm run build
npm test
```

الاختبارات تستخدم أدوات CLI الحقيقية وقوالب ProjectDiscovery الأصلية غير المعدّلة، بمجموعة صغيرة مخصصة للاختبار، وخادم HTTP محلي بتواقيع معروفة. بعض التواقيع، مثل CVE وtakeover وdefault-login، محاكاة ردود لخدمة وليست إثبات استغلال منتج فعلي. اختبار XSS يستخدم انعكاس HTML غير مهرب فعليًا. لا توجد نتائج fallback مفبركة داخل التطبيق. نتائج 1.12.0 المسجلة موجودة في `TEST-REPORT.md` و`validation/`، كما أعاد `npm audit` صفر ثغرات معروفة وقت بناء النسخة.

الـAPI يستمع على `127.0.0.1` فقط ويرفض `Host` أو browser `Origin` غير محلي، حتى لا تستطيع صفحة ويب عامة تشغيل أدوات جهازك أو قراءة ملفات المشاريع عبر خدمة HunterKit المحلية.

اختبارات المتصفح والصور تحتاج ضبط `HUNTERKIT_TEST_BROWSER` على مسار Chrome/Edge/Chromium، ثم `npm test`. بدون ذلك يظهر اختبارا المتصفح كـ SKIP. في حاوية التحقق المعزولة استُخدم wrapper اختبار مؤقت لتشغيل Chromium بدون sandbox المتصفح؛ لم يُضف هذا التجاوز إلى التطبيق أو ملفات التشغيل. الافتراضي في التطبيق يطلب sandbox.

للتشغيل على كامل مجلدات قوالب Nuclei المثبتة، على fixture محلي فقط:

```bash
npx tsx tests/production-smoke.mts
```

نتائج هذه الجولة تُكتب في `validation/production-profiles.json` مع تمييز التشغيل الكامل من الجزئي. لا تشغّلها بالتوازي مع تحديث قوالبك.

## الملفات المهمة للتطوير

- `backend/src/core.ts`: orchestration، المدخلات، تشغيل الأدوات، حفظ الأدلة والحالات والتجميع.
- `backend/src/targets.ts`: فصل hostname عن URL والتحقق من النطاق.
- `backend/src/server.ts`: REST bridge لمسميات IPC الأصلية وخدمة ملفات المشاريع.
- `frontend/src/views/project/attacks/AttackButton.tsx`: تشغيل الفحوص وإظهار ملخص دائم.
- `frontend/src/views/project/attackResults.tsx`: عرض الأدلة والمصادر والتواريخ وحالة التغطية.
- `frontend/src/views/project/SecurityTesting.tsx`: تشغيل وعرض headers/TLS/CORS/methods/CVE evidence.
- `frontend/src/views/project/IntelligentAnalysis.tsx`: التقرير الموحد، المخاطر، وحدود تفسير AI.
- `scripts/*-lock.json`: إصدارات وبصمات الأدوات والقوالب المختبرة.
- `tests/`: unit + real-tool integration + HTTP API + browser regression tests.

## حدود مقصودة

- SQL injection يستخدم قوالب Nuclei DAST المختبرة في هذه النسخة؛ لم يُضمّن sqlmap لأن توزيعه يتطلب Python وسلسلة تثبيت منفصلة لم تُتحقق على Windows داخل بيئة البناء.
- لم يُضف SSRF نشط عام لأنه يحتاج collaborator آمنًا ومعملًا مخصصًا لإثبات الاتصال الخارجي بدون ادعاءات كاذبة.
- الجلسات المسجلة وPOST/JSON/SPAs تحتاج مدخلات أو workflows مخصصة؛ الاكتشاف التلقائي الحالي يركز على روابط ونماذج GET داخل النطاق.

إصدارات الملفات التنفيذية مثبتة لـ **Windows x64 وLinux x64**. ملفات Windows تم تنزيلها والتحقق من بصماتها ومحتوياتها، لكن تنفيذها على Windows لم يُختبر في بيئة Linux الحالية. على معماريات أخرى المثبت يتوقف برسالة واضحة؛ لا يختار ملف CPU غير مناسب تلقائيًا.
