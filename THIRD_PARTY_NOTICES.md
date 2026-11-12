# Third-party notices

The client uses React, React DOM and Scheduler. Their installed license text is reproduced below. Server dependencies and development tools are installed from the committed npm lockfile; their own license and notice files remain applicable. No node_modules, browser binaries, model weights or generated application bundle is committed for redistribution. This file records observed installed-package metadata and notices, not a blanket rights-clearance claim.

## React, React DOM and Scheduler

Source packages: react 19.3.0, react-dom 19.3.0, scheduler 0.28.0.

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Vite build runtime

The build includes Vite's module-preload runtime helper.

```text
# Vite core license
Vite is released under the MIT license:

MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Runtime dependency inventory

| Package | Installed version | Declared license |
| --- | --- | --- |
| @fastify/accept-negotiator | 2.1.0 | MIT |
| @fastify/ajv-compiler | 4.0.6 | MIT |
| @fastify/error | 4.2.0 | MIT |
| @fastify/fast-json-stringify-compiler | 5.1.0 | MIT |
| @fastify/forwarded | 3.0.2 | MIT |
| @fastify/merge-json-schemas | 0.2.1 | MIT |
| @fastify/proxy-addr | 5.1.1 | MIT |
| @fastify/send | 4.1.1 | MIT |
| @fastify/static | 10.1.5 | MIT |
| @lukeed/ms | 2.0.2 | MIT |
| @pinojs/redact | 0.4.0 | MIT |
| abstract-logging | 2.0.1 | MIT |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| atomic-sleep | 1.0.0 | MIT |
| avvio | 9.3.0 | MIT |
| balanced-match | 4.0.4 | MIT |
| brace-expansion | 5.0.12 | MIT |
| content-disposition | 3.0.0 | MIT |
| cookie | 1.1.1 | MIT |
| depd | 2.0.0 | MIT |
| dequal | 2.0.3 | MIT |
| escape-html | 1.0.3 | MIT |
| fast-decode-uri-component | 1.0.1 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-json-stringify | 7.0.1 | MIT |
| fast-querystring | 1.1.2 | MIT |
| fast-uri | 3.1.8 | BSD-3-Clause |
| fast-uri | 4.2.1 | BSD-3-Clause |
| fastify | 5.12.5 | MIT |
| fastify-plugin | 6.0.0 | MIT |
| fastq | 1.20.3 | ISC |
| find-my-way | 9.9.0 | MIT |
| glob | 13.0.6 | BlueOak-1.0.0 |
| http-errors | 2.0.1 | MIT |
| inherits | 2.0.4 | ISC |
| ipaddr.js | 2.5.0 | MIT |
| json-schema-ref-resolver | 3.0.0 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| light-my-request | 6.6.0 | BSD-3-Clause |
| lru-cache | 11.5.3 | BlueOak-1.0.0 |
| mime | 3.0.0 | MIT |
| minimatch | 10.2.6 | BlueOak-1.0.0 |
| minipass | 7.1.3 | BlueOak-1.0.0 |
| on-exit-leak-free | 2.1.2 | MIT |
| path-scurry | 2.0.2 | BlueOak-1.0.0 |
| pino | 10.4.0 | MIT |
| pino-abstract-transport | 3.0.0 | MIT |
| pino-std-serializers | 7.1.0 | MIT |
| process-warning | 4.0.1 | MIT |
| process-warning | 5.1.0 | MIT |
| quick-format-unescaped | 4.0.4 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| real-require | 1.0.0 | MIT |
| require-from-string | 2.0.2 | MIT |
| ret | 0.5.0 | MIT |
| reusify | 1.1.0 | MIT |
| rfdc | 1.4.1 | MIT |
| safe-regex2 | 5.1.1 | MIT |
| safe-stable-stringify | 2.5.0 | MIT |
| scheduler | 0.28.0 | MIT |
| secure-json-parse | 4.1.0 | BSD-3-Clause |
| semver | 7.8.5 | ISC |
| set-cookie-parser | 2.7.2 | MIT |
| setprototypeof | 1.2.0 | ISC |
| sonic-boom | 4.2.1 | MIT |
| split2 | 4.2.0 | ISC |
| statuses | 2.0.2 | MIT |
| thread-stream | 4.2.0 | MIT |
| toad-cache | 3.7.4 | MIT |
| toidentifier | 1.0.1 | MIT |
| zod | 4.6.5 | MIT |

The installed abstract-logging 2.0.1 package declares MIT and links to its author's license at <http://jsumners.mit-license.org/> in Readme.md; it does not ship a standalone LICENSE file. Preserve that README if redistributing installed server dependencies. No server dependencies are vendored in this source repository.

Node.js and npm are prerequisites with their own notices; Playwright Chromium is a separately installed test tool. Retain their notices if distributing their binaries.
