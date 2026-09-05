import {compileHTML} from './compiler.ts';
import {checkPublish} from './world.ts';
import {formFields,formIsVisible} from './forms.ts';
import {validateProjectBundle} from './project-io.ts';
export type PortableSources={world:string;compiler:string;forms:string;projectIo:string;build:string;server:string;responses:string;instance:string;adminAuth:string;adminOperator:string;adminHtml:string;adminScript:string};
export function portableFiles(value:unknown,sources:PortableSources){
 const project=validateProjectBundle(value),errors=checkPublish(project.graph).filter(i=>i.severity==='error');
 if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
 for(const form of project.graph.pieces.filter(p=>p.type==='form'&&formIsVisible(project.graph,p.id)))formFields(project.graph,form.id);
 const html=compileHTML(project.graph,{title:project.name,entry:project.entry,formEndpoint:'/api/forms',assetUrls:Object.fromEntries(project.assets.map(a=>[a.path,a.data]))});
 if(/\/api\/assets\/|blob:/.test(html))throw Error('An asset is missing from this bundle or still uses a temporary URL.');
 const files=[{name:'project.vorlda.json',content:JSON.stringify(project,null,2)},{name:'public/index.html',content:html},
  ...(['world','compiler','forms'] as const).map(k=>({name:`src/${k}.ts`,content:sources[k]})),{name:'src/project-io.ts',content:sources.projectIo},
  ...(['build','server','responses','instance'] as const).map(k=>({name:k+'.mjs',content:sources[k]})),
  {name:'admin-auth.mjs',content:sources.adminAuth},{name:'admin-operator.mjs',content:sources.adminOperator},{name:'admin.html',content:sources.adminHtml},{name:'admin.js',content:sources.adminScript},
  {name:'package.json',content:JSON.stringify({name:'vorlda-export',version:'1.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{build:'node build.mjs',start:'node server.mjs',responses:'node responses.mjs','admin:init':'node admin-operator.mjs init','admin:reset':'node admin-operator.mjs reset',test:'node --test test.mjs'}},null,2)},
  {name:'.gitignore',content:'data/\n.env\nnode_modules/\n'},
  {name:'.env.example',content:'HOST=127.0.0.1\nPORT=3000\nVORLDA_ENV=development\n# Production needs its own initialized database and credentials:\n# VORLDA_ENV=production\n# PUBLIC_APP=1\n# HOST=0.0.0.0\n# APP_ORIGIN=https://your-domain.example\n# VORLDA_DATA_DIR=/private/persistent/vorlda-app\n'},
  {name:'test.mjs',content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {project} from './build.mjs';\nimport {validateProjectBundle} from './src/project-io.ts';\ntest('project round trip',()=>assert.deepEqual(validateProjectBundle(project),project));\n"},
  {name:'README.md',content:portableReadme(project.name,!!project.runtime?.admin)},
 ];
 return files;
}
export async function portableManifest(files:{name:string;content:string}[]){return JSON.stringify({format:'vorlda-native-source',version:1,runtime:'Node.js >=24',backend:'single-instance SQLite contact forms',files:await Promise.all(files.map(async f=>({path:f.name,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(f.content))),b=>b.toString(16).padStart(2,'0')).join('')})))},null,2);}

function portableReadme(name:string,admin:boolean){return `# ${name.replace(/[\r\n]/g,' ')} — native VORLDA application

Node.js >=24 is required. No npm install, platform credentials or network downloads are needed.

## Local development

Run npm test, then npm start. Open http://127.0.0.1:3000.
The default development database is data/development/forms.sqlite. Production uses data/production/forms.sqlite. Runtime credentials, sessions and responses are NEVER part of the source export.

Optional owner administration is ${admin?'ENABLED':'DISABLED'} in this package. It manages contact-form responses, not customer accounts, platform settings, billing or AI generation.

## First owner login (when enabled)

1. Run npm run admin:init locally. It displays username admin and a unique temporary password ONCE. This expires in one hour. Deliver it privately to the owner; do not publish it, put it into a source file, or save it in build logs. There is no automatic email delivery.
2. Run npm start and visit http://127.0.0.1:3000/admin.
3. Sign in with the temporary credentials. Responses remain inaccessible until you set your own 15–128-character passphrase. The previous sessions are revoked.
4. Use /admin to read and download pages of up to 100 responses. npm run responses exports all responses locally as JSON Lines; handle this output as personal data.

To recover access, an OS-authorized operator can run npm run admin:reset -- --confirm-reset. This issues a NEW temporary password and revokes ALL admin sessions; it never reveals the old password. There is no public registration/reset endpoint and no password bypass through project import.

## Production setup — separate account and database

Do not copy the development database or its credentials into production. Promote only reviewed source/design/assets. Stop the process before backing up the complete production data directory, then test restoration.

For portable commands on macOS/Linux/Windows, create a private .env file with VORLDA_ENV=production, HOST=127.0.0.1 and PORT=3000. Leave PUBLIC_APP unset during initial local setup. If using VORLDA_DATA_DIR, use the SAME private persistent directory for ALL operator and server commands.

Run exactly:

    node --env-file=.env admin-operator.mjs init
    node --env-file=.env server.mjs

Open the local /admin page and replace the temporary password. Stop the server, configure an HTTPS reverse proxy and persistent disk, then set PUBLIC_APP=1, HOST=0.0.0.0 and APP_ORIGIN=https://your-exact-domain.example in that same .env. Restart with node --env-file=.env server.mjs. The reverse proxy must preserve the configured Host; TLS terminates there. Public startup refuses an uninitialized or still-temporary admin account. A running recovery flow remains password-restricted.

For production recovery use node --env-file=.env admin-operator.mjs reset --confirm-reset, not the default development command. Plain npm start/admin:init do NOT automatically load .env. Always use matching environment arguments.

VORLDA_DATA_DIR is optional and must never be the project root or inside public/. An instance is bound to its initial environment and rejects a different one. If upgrading a previous export with data/forms.sqlite, startup stops rather than silently ignoring it: explicitly point VORLDA_DATA_DIR to its original data directory and choose the correct environment. Back it up first; this does not automatically convert testing data into production data.

## Security and operating boundaries

This is a single-instance Node/SQLite service, not a scalable multi-tenant host. Password hashing uses async scrypt with N=131072, r=8, p=1 (about 128 MiB per derivation); concurrent password work is capped. Benchmark memory and latency on your target host. Rate limits use socket IP, not user-supplied forwarded headers; a reverse proxy may share limits across visitors. Configure ingress abuse protection. No MFA or comprehensive breached-password service is included: do not treat this as enterprise identity management.

Set a restrictive OS umask such as 077. Do not serve the project root. The supplied server serves only explicit application/admin routes. Keep source, .env, data directories and backups private. The application page becomes public when public mode is enabled; the optional owner console does not make the customer-facing page private. Data manually embedded in the visual project is client content, not a secret vault.

## Source and reimport

project.vorlda.json contains native design and embedded assets. src/world.ts defines the schema, src/compiler.ts builds the frontend, src/forms.ts validates forms, server.mjs serves it, and admin-auth.mjs implements optional owner authentication. Rebuild with npm run build.

Import project.vorlda.json into VORLDA to recover its visual structure and original assets. Import does not read or change accounts in a running exported installation. Re-exporting initializes no live account; a new installation needs its own operator initialization. Direct edits to compiler/server code do not round-trip into the visual editor. Importing arbitrary React/Flutter repositories is not supported. Re-select optional runtime capabilities when exporting from the visual editor.

Embedded asset limit is 16 MiB; expanded HTML has a separate safe budget. External HTTPS media may require internet. Included: native pages, local interactions, contact forms and optional single-owner administration. Not included: customer registration, payments, wallet/subscriptions, AI agents or arbitrary application backends. The VORLDA workshop itself is not this exported application.

## العربية

حساب إدارة مالك التطبيق اختياري ومستقل عن حساب VORLDA وعن حسابات العملاء. بيانات التجربة والإنتاج منفصلة. يُظهر أمر التهيئة كلمة أولية فريدة مرة واحدة، ويجب تغييرها قبل قراءة ردود النماذج. لا تُرسل كلمة المرور داخل ملف المشروع ولا يُرسلها النظام بالبريد تلقائيًا. إعادة رفع المشروع لا تتجاوز حماية التطبيق المنشور ولا تغيّر حساباته. عند اعتماد التطوير انقل الكود فقط، لا حسابات الاختبار ولا قواعد بياناتها.

Security references: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
`;}
