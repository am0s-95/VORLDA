import world from './world.ts?raw';
import compiler from './compiler.ts?raw';
import forms from './forms.ts?raw';
import projectIo from './project-io.ts?raw';
import build from '../portable/build.mjs.template?raw';
import server from '../portable/server.mjs.template?raw';
import responses from '../portable/responses.mjs.template?raw';
export const portableSources={world,compiler,forms,projectIo,build,server,responses};
