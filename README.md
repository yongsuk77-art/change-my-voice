# 내 말투로

옛 설교문 샘플을 기준으로 새 글을 한 사람의 어투와 문체로 정리하는 웹앱입니다. 문체 반영 강도, 글의 용도, 문장 리듬, 성경 장절 보존, 의미 보존, AI 티 줄이기, 최종 문장 점검 옵션을 조절할 수 있습니다.

TXT, Markdown, PDF 파일을 문체 소스로 추가할 수 있고, 올린 자료는 브라우저에 축적됩니다. 소스 목록에서 어떤 파일을 사용 중인지 확인하거나 비활성화/삭제할 수 있습니다. 베이스를 업데이트하거나 초기화하기 전에는 자동으로 스냅샷이 남아, 이전 문체 베이스로도 변환할 수 있습니다.

최종 점검은 제목/목록 같은 Markdown 구조를 보존하고, 문장 어색함, 맞춤법성 표현, 핵심어·숫자·성경 장절 누락 가능성을 결과 패널에 표시합니다.

블로그 형식은 짧은 문장 단락으로 글을 나누고, 결과 패널에서 토다 공동체용 양 캐릭터가 문장 내용에 맞는 표정으로 등장하는 그림책형 미리보기를 제공합니다. 생성한 캐릭터 시트는 `public/toda-sheep-character-sheet.png`에 포함되어 있습니다.

MIT 라이선스로 공개해 누구나 자유롭게 사용하고 수정할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

앱 주소는 `http://127.0.0.1:5173`입니다.

## OpenAI 연결

API 키가 없으면 브라우저 로컬 문체 엔진으로 동작합니다. 실제 모델 변환을 쓰려면 `.env.example`을 참고해 `.env`를 만들고 값을 넣으면 됩니다.

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.4-mini
PORT=5173
```

## 문체 베이스 분량

한 파일만으로도 테스트는 가능하지만, 한 사람의 문체처럼 안정되려면 여러 편이 필요합니다.

- 최소: 공백 제외 8,000자 이상
- 안정: 30,000자 이상
- 권장: 50,000자 이상, 설교문 5-10편 이상

같은 시기의 글만 넣기보다 설교문, 묵상문, 목회서신처럼 실제로 자주 쓰는 형식을 섞으면 더 자연스럽습니다.

Cloudflare Pages에 배포한 뒤에도 OpenAI 변환을 쓰려면 Pages 프로젝트의 secret으로 `OPENAI_API_KEY`를 넣으면 됩니다.

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name=change-my-voice
npx wrangler pages secret put OPENAI_MODEL --project-name=change-my-voice
```

## 배포

```bash
npm run build
npx wrangler pages deploy ./dist --project-name=change-my-voice
```

## 검증

```bash
npm run build
```

Playwright로 데스크톱과 모바일 화면을 확인한 스크린샷은 `output/playwright`에 있습니다.
