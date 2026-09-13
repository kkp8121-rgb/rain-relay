# RAIN RELAY · 꽃들이 비를 기억하는 법

**빗방울에 꽃의 빛을 섞어, 메마른 정원을 스스로 피어나게 만든다.**

관을 배치하고 흐름을 관찰하는 3D 정원 자동화 퍼즐입니다. 여섯 정원에서 빛의 조합, 교대 분배, 교차 수로를 설계합니다. 각 정원에는 유한한 물과 부품 예산이 있으며, 수집기마다 요구하는 색과 수량이 다릅니다.

계획에는 시간 제한이 없습니다. 누수가 세 번 발생하면 시험이 끝나며, 만든 배치를 유지한 채 다시 고칠 수 있습니다. 힌트는 다음 부품의 위치와 모양을 표시합니다. 힌트 없이 적은 부품으로 완주하면 높은 등급을 받습니다.

## 실행

`index.html`을 직접 여십시오. 런타임 CDN이나 서버가 필요하지 않습니다.

개발 서버는 `npm ci` 이후 `npm run serve`로 실행합니다. 주소는 `http://127.0.0.1:4184/rain-relay/`이며 명령이 브라우저를 자동으로 열지는 않습니다.

## 조작

| 입력 | 동작 |
|---|---|
| WASD / 방향키 | 편집 커서 이동 |
| 1–4 | 직선 / 꺾임 / 분기기 / 브리지 선택 |
| R | 선택 부품 회전 |
| Space | 배치 |
| Backspace / Z | 회수 / 되돌리기 |
| H | 다음 연결 힌트 |
| Enter | 시험 시작·중단, 실패 후 편집, 다음 정원 |
| Esc / M | 일시정지 / 무음 |
| 마우스 클릭 | 해당 칸에 배치 |
| 터치 | 칸 선택 후 화면의 놓기·회전·회수 버튼 사용 |

꽃은 물방울에 자기 빛을 **더합니다**. 빨강+초록은 노랑, 빨강+파랑은 자홍, 초록+파랑은 청록, 세 빛은 별빛입니다. 분기기는 물방울을 복제하지 않고 두 출구로 번갈아 보냅니다. 브리지는 두 흐름이 색을 섞지 않고 교차하게 합니다.

## 개발 및 검증

```text
npm ci
npx playwright install chromium
npm test
npm run build
npm run test:browser
npm run test:campaign
npm run test:interaction
node tests/performance.cjs
npm run pack
npm run test:package
```

전체 여정 검사는 실제 키보드로 63개 부품을 배치해 여섯 정원을 완주합니다. 모바일 및 성능 검사는 이 완주 보고서의 기록을 사용해 마지막 정원을 선택하므로 `test:campaign`을 먼저 실행하십시오. 검사 코드는 게임 상태를 강제로 승리시키지 않습니다. 모든 브라우저 검사는 headless입니다. GPU 검사는 Windows D3D11을 사용합니다.

`dist/rain-relay-web.zip`은 itch.io HTML 업로드용입니다. ZIP 안에는 루트의 `index.html`과 상대 경로의 자산이 포함됩니다.

## 제작

Three.js로 직접 만든 온실·유리 수로·분기 밸브·꽃·물방울, Web Audio로 합성한 음악과 효과음을 사용합니다. 키 아트와 성인 등장인물 초상은 ImageGen으로 제작한 원본 이미지이며, 생성 프롬프트와 PNG 원본을 함께 보관합니다. [아트 기록](docs/ART.md), [제작 판단](docs/PRODUCTION.md), [실측 검증](docs/QA.md).

Three.js의 MIT 라이선스는 `licenses/three.txt`에 포함되어 있습니다.

## 공개 배포

목표 저장소는 `kkp8121-rgb/rain-relay`입니다. 로컬 제작 완료 후 별도 push 승인을 받아 GitHub Pages를 활성화합니다. 승인 전에는 `https://kkp8121-rgb.github.io/rain-relay/`가 공개 플레이 주소로 작동하지 않습니다.
