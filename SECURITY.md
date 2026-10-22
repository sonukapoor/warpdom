# Security policy

## Supported versions

Security fixes go into the latest minor release of `warpdom` (today 0.1.x)
and of the companion packages `vitest-environment-warpdom` and
`jest-environment-warpdom`. Older releases do not get fixes; upgrade to
the latest. See [docs/stability.md](docs/stability.md).

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub:
[Report a vulnerability](https://github.com/sonukapoor/warpdom/security/advisories/new)
(the repository's Security tab, "Report a vulnerability"). Include the
warpdom version, the Node version, the test runner, and the smallest code
that shows the problem.

You will get an answer within 7 days. Once a fix is released, the advisory
is published with credit to the reporter, unless they prefer otherwise.

## Scope

warpdom runs test code, not untrusted web content, and is not a sandbox.
Like jsdom as Vitest and Jest set it up (`runScripts: 'dangerously'`),
script elements made by the HTML parser do not run, but code in HTML can:
inline event handler attributes (`onclick="..."`) run when the event is
dispatched, `javascript:` links run when followed, and script elements
created by script run when connected. That code runs in the test's
process with the test's permissions. Reports are most
useful for problems a test suite can hit without intending to, for
example a crafted HTML, CSS or XML string that makes parsing hang or
exhaust memory, a request (`XMLHttpRequest`) that skips the CORS checks
warpdom models, or `warpdom compare` and `warpdom migrate` writing outside
the project directory.
