# 내 말투로

옛 설교문 샘플을 기준으로 새 글을 한 사람의 어투와 문체로 정리하는 웹앱입니다. 문체 반영 강도, 글의 용도, 문장 리듬, 성경 장절 보존, 의미 보존, AI 티 줄이기 옵션을 조절할 수 있습니다.

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
