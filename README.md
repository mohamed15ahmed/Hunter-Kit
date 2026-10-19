# HunterKit Web 1.11.0 — Attack pipeline fix

نسخة إصلاح للمشروع المرفق. التفاصيل الفنية ونتائج التحقق في [تقرير الإصلاح](FIX-REPORT.ar.md).

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
  -> POST /api/jobs ثم polling لحالة المهمة
  -> backend/src/server.ts
  -> backend/src/core.ts
  -> أدوات CLI محلية
  -> projects/<name>/{results, logs, details.json}
  -> Results / Attack
```

لا يوجد Electron runtime ولا قاعدة بيانات في هذه النسخة. البيانات ملفات JSON وTXT لكل مشروع.

ابدأ بـ Create Project ثم RECON → Run Full Recon. يمكن تشغيل الهجمات مباشرة؛ المدخلات اللازمة تُجهّز عند غيابها. بعد أي تغيير في صفحات المعمل اضغط Parameters لتحديث روابطه. مكتشف الصفحات محدود بـ12 صفحة ويفهم الروابط ونماذج GET، ولا ينفذ JavaScript ولا يسجل الدخول تلقائيًا.

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

صفحة **Results → Attack** تعرض آخر تشغيل لكل module، المصدر، التاريخ، القوالب المحمّلة، وعدد الطلبات والأخطاء:

- **COMPLETED**: انتهت الفحوص المختارة لمدخلاتها المختارة. صفر لا يثبت خلو التطبيق من كل الثغرات.
- **COMPLETED WITH ERRORS**: انتهى برنامج الفحص، لكن بعض الطلبات فشلت؛ الفحوص المرتبطة بها تظل ناقصة.
- **PARTIAL**: انتهت مهلة العملية قبل إكمالها أو تعذّر التحقق من إحصاءات الاكتمال؛ الأدلة التي وصلت تُحفظ.
- **CONNECTION BLOCKED**: فشل اتصال برنامج الفحص بالهدف أو ردّ بمنع/تحديد معدل؛ لم يبدأ الفحص الكبير.
- **SKIPPED**: لم يُنفّذ الفحص، مثل غياب روابط البارامترات.
- **FAILED**: مشكلة واضحة في المدخلات أو الأداة أو القوالب أو الاتصال، مع رسالة خطأ.
- **RUNNING**: تشغيل جارٍ. **LEGACY / UNKNOWN**: بيانات قديمة لا تثبت اكتمال الفحص؛ أعد تشغيله.

الفحص العام لم يعد يعتمد على التعرف على تقنية الموقع. Panels يمكن أن يرجع info detections؛ وجود لوحة دخول ليس إثباتًا لاستغلال ثغرة. XSS يحتسب نتائج Dalfox من نوع **V** فقط؛ R/A/I محفوظة في التقرير الخام كملاحظات منفصلة.

كل module يحتفظ بآخر تشغيل خاص به. إعادة Panels لا تمسح نتيجة قديمة من General؛ جدول النتائج يوضح المصدر والتاريخ حتى لا تختلط التشغيلات.

الفحوص محدودة افتراضيًا: General حتى8 مدخلات، Panels/Exposures/CVEs/LFI حتى10، Default logins حتى5، Takeovers حتى50، SQLi حتى15، XSS حتى25. الأدوات تعمل بالتتابع عبر طابور واحد لكل جلسات الـAPI. Nuclei يعمل بحد10 طلبات/ثانية وتوازٍ2 وبمهلة180 ثانية للعملية؛ Dalfox بحد10 طلبات/ثانية وهدف واحد في الوقت نفسه ومهلة إجمالية180 ثانية. مهلة الطلب الافتراضية15 ثانية مع إعادة محاولة واحدة. الفحص على قوائم كبيرة قد يكون PARTIAL. يمكن تعديل `HUNTERKIT_SCAN_TIMEOUT_MS` في `.env` بين1000 و600000 لتغيير مهلة عملية Nuclei/Dalfox. السكربت `tests/production-smoke.mts` يستخدم30 ثانية عمدًا لقياس حفظ النتائج الجزئية.

من صفحة Attacks اضغط **Check target connection** لرؤية نتيجة GET عادي من Node ومن Nuclei نفسه، ثم **Download diagnostic report** لتنزيل تقرير JSON بحالات الفحوص وأسباب الأخطاء. فحص الاتصال لا يُحتسب كثغرة. عند غياب scheme يختبر HTTP/HTTPS بالمنفذ الصحيح ويستبعد الأصل غير المتاح؛ لا يغيّر scheme صريحًا تلقائيًا.

`HUNTERKIT_PROXY` يضبط مسار اتصال Nuclei وDalfox ومكتشف صفحات Node. عند غيابه تُستخدم متغيرات HTTP(S)_PROXY/NO_PROXY، ثم static proxy الخاص بمستخدم Windows. ملفات PAC وجلسة المتصفح لا تنتقل إلى الأدوات. يمكن استخدام `HUNTERKIT_PROXY=direct` للاتصال المباشر المقصود. JSLeak وSubfinder ومزوّدو الأرشيف لهم سلوكهم الأصلي؛ هذا الإعداد ليس proxy شاملًا لكل البرامج. لا تعطّل برامج الحماية لحل فشل اتصال أداة. `HUNTERKIT_REQUEST_TIMEOUT_SECONDS` يغيّر مهلة طلب الهجوم من3 إلى60 ثانية.

المهام تستمر عند تحديث الصفحة، ويمكن إعادة الضغط على نفس module للاتصال بمهمته الموجودة. المهام في الذاكرة ولا تستمر عبر إعادة تشغيل backend؛ النتائج المكتوبة على القرص تستمر. يمكن إلغاء مهمة ما زالت في الانتظار.

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
- `logs/connection-report.json`: نتيجة اتصال Node/Nuclei ومصدر إعداد proxy، بدون كلمة مرور proxy.
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

الاختبارات تستخدم أدوات CLI الحقيقية وقوالب ProjectDiscovery الأصلية غير المعدّلة، بمجموعة صغيرة مخصصة للاختبار، وخادم HTTP محلي بتواقيع معروفة. بعض التواقيع، مثل CVE وtakeover وdefault-login، محاكاة ردود لخدمة وليست إثبات استغلال منتج فعلي. اختبار XSS يستخدم انعكاس HTML غير مهرب فعليًا. لا توجد نتائج fallback مفبركة داخل التطبيق.

اختبارات المتصفح والصور تحتاج ضبط `HUNTERKIT_TEST_BROWSER` على مسار Chrome/Edge/Chromium، ثم `npm test`. بدون ذلك يظهر اختبارا المتصفح كـ SKIP. في حاوية التحقق المعزولة استُخدم wrapper اختبار مؤقت لتشغيل Chromium بدون sandbox المتصفح؛ لم يُضف هذا التجاوز إلى التطبيق أو ملفات التشغيل. الافتراضي في التطبيق يطلب sandbox.

للتشغيل على كامل مجلدات قوالب Nuclei المثبتة، على fixture محلي فقط:

```bash
npx tsx tests/production-smoke.mts
```

نتائج الجولة السابقة محفوظة في `validation/1.10.0/production-profiles.json`، وإعادة تشغيل السكربت تكتب `validation/production-profiles.json` مع تمييز التشغيل الكامل من الجزئي. لا تشغّلها بالتوازي مع تحديث قوالبك.

## الملفات المهمة للتطوير

- `backend/src/core.ts`: orchestration، المدخلات، تشغيل الأدوات، حفظ الأدلة والحالات والتجميع.
- `backend/src/targets.ts`: فصل hostname عن URL والتحقق من النطاق.
- `backend/src/server.ts`: REST bridge لمسميات IPC الأصلية وخدمة ملفات المشاريع.
- `frontend/src/views/project/attacks/AttackButton.tsx`: تشغيل الفحوص وإظهار ملخص دائم.
- `frontend/src/views/project/attackResults.tsx`: عرض الأدلة والمصادر والتواريخ وحالة التغطية.
- `scripts/*-lock.json`: إصدارات وبصمات الأدوات والقوالب المختبرة.
- `tests/`: unit + real-tool integration + HTTP API + browser regression tests.

إصدارات الملفات التنفيذية مثبتة لـ **Windows x64 وLinux x64**. ملفات Windows تم تنزيلها والتحقق من بصماتها ومحتوياتها، لكن تنفيذها على Windows لم يُختبر في بيئة Linux الحالية. على معماريات أخرى المثبت يتوقف برسالة واضحة؛ لا يختار ملف CPU غير مناسب تلقائيًا.

### تفسير صور Madaar

في الصور الجديدة بعض profiles أرسلت مئات وآلاف الطلبات وانتهت؛ هذا يختلف عن حالة فشل جميع طلبات الموقع السابق. الصفر يعني عدم وجود تطابق في المدخلات والقوالب المختارة فقط. غياب query URLs أدى إلى تخطي SQLi/LFI/XSS بالكامل. إذا كانت المدخلات وراء تسجيل الدخول أو POST/JavaScript، فلا تغطيها هذه النسخة تلقائيًا. لم يُختبر `madaar.runasp.net` من هذه البيئة: سياسة الاتصال منعت GET للصفحة العامة، وهذا ليس ردًا من الموقع ولا دليلًا على سلامته أو تعطله.
