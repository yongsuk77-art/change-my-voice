import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const packDir = path.join(root, "public", "toda-sheep-pack");
const svgDir = path.join(packDir, "svg");
const pngDir = path.join(packDir, "png");

const assets = [
  ["peaceful", "평안", "평안한 토다 양", "calm"],
  ["despair", "절망", "절망한 토다 양", "despair"],
  ["praying", "기도", "기도하는 토다 양", "pray"],
  ["surprised", "놀람", "놀란 토다 양", "surprise"],
  ["hopeful", "소망", "소망을 보는 토다 양", "hope"],
  ["reading-bible", "말씀 읽기", "말씀 읽는 토다 양", "book"],
  ["comforting", "위로", "위로하는 토다 양", "comfort"],
  ["celebrating", "기쁨", "기뻐하는 토다 양", "celebrate"],
  ["thinking", "생각", "생각하는 토다 양", "think"],
  ["sleeping", "쉼", "잠든 토다 양", "sleep"],
  ["waving", "인사", "손 흔드는 토다 양", "wave"],
  ["heart", "사랑", "하트를 든 토다 양", "heart"],
  ["worshiping", "찬양", "찬양하는 토다 양", "worship"],
  ["teaching", "가르침", "가르치는 토다 양", "teach"],
  ["listening", "경청", "듣고 있는 토다 양", "listen"],
  ["walking", "동행", "걸어가는 토다 양", "walk"],
  ["running", "달림", "달려가는 토다 양", "run"],
  ["umbrella", "보호", "우산 든 토다 양", "umbrella"],
  ["lantern", "인도", "등불 든 토다 양", "lantern"],
  ["crying", "눈물", "눈물 흘리는 토다 양", "cry"],
  ["smiling", "미소", "활짝 웃는 토다 양", "smile"],
  ["confused", "당황", "어리둥절한 토다 양", "confused"],
  ["thankful", "감사", "감사하는 토다 양", "thankful"],
  ["hugging", "포옹", "꼭 안아주는 토다 양", "hug"],
  ["carrying-book", "책", "책을 안은 토다 양", "carryBook"],
  ["pointing-up", "하늘 보기", "위를 가리키는 토다 양", "point"],
  ["writing", "기록", "글 쓰는 토다 양", "write"],
  ["tea", "차 한잔", "차 마시는 토다 양", "tea"],
  ["kneeling", "무릎", "무릎 꿇은 토다 양", "kneel"],
  ["cheering", "응원", "응원하는 토다 양", "cheer"]
].map(([slug, titleKo, labelKo, pose], index) => ({
  index: index + 1,
  slug,
  titleKo,
  labelKo,
  pose,
  fileBase: `${String(index + 1).padStart(2, "0")}-${slug}`
}));

await mkdir(svgDir, { recursive: true });
await mkdir(pngDir, { recursive: true });

for (const asset of assets) {
  const svg = makeSvg(asset);
  await writeFile(path.join(svgDir, `${asset.fileBase}.svg`), svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(path.join(pngDir, `${asset.fileBase}.png`));
}

await makeContactSheet();

await writeFile(
  path.join(packDir, "manifest.json"),
  JSON.stringify(
    assets.map((asset) => ({
      id: asset.fileBase,
      titleKo: asset.titleKo,
      labelKo: asset.labelKo,
      png: `png/${asset.fileBase}.png`,
      svg: `svg/${asset.fileBase}.svg`
    })),
    null,
    2
  ),
  "utf8"
);

console.log(`Generated ${assets.length} Toda sheep assets in ${packDir}`);

async function makeContactSheet() {
  const tile = 180;
  const cols = 6;
  const rows = Math.ceil(assets.length / cols);
  const composites = await Promise.all(
    assets.map(async (asset, index) => {
      const input = await sharp(path.join(pngDir, `${asset.fileBase}.png`)).resize(150, 150, { fit: "contain" }).png().toBuffer();
      return {
        input,
        left: (index % cols) * tile + 15,
        top: Math.floor(index / cols) * tile + 15
      };
    })
  );

  await sharp({
    create: {
      width: cols * tile,
      height: rows * tile,
      channels: 4,
      background: "#fffdfb"
    }
  })
    .composite(composites)
    .png()
    .toFile(path.join(packDir, "contact-sheet.png"));
}

function makeSvg(asset) {
  const pose = asset.pose;
  const state = poseState(pose);
  const woolShift = pose === "run" ? -8 : pose === "walk" ? -4 : 0;
  const tilt = pose === "confused" ? -5 : pose === "cheer" ? 4 : pose === "sleep" ? -4 : 0;
  const bodyY = pose === "kneel" ? 28 : pose === "run" ? -8 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${escapeXml(asset.labelKo)}">
  <title>${escapeXml(asset.labelKo)}</title>
  <desc>토다 공동체용 귀여운 양 캐릭터 ${escapeXml(asset.titleKo)} 이미지</desc>
  <g transform="translate(0 ${bodyY}) rotate(${tilt} 256 266)">
    <ellipse cx="256" cy="430" rx="120" ry="28" fill="#2b3b3c" opacity=".10"/>
    ${decorations(pose)}
    ${legs(pose)}
    ${arms(pose)}
    <g transform="translate(${woolShift} 0)">
      <ellipse cx="166" cy="226" rx="45" ry="64" fill="#ead0c8" stroke="#6c5a50" stroke-width="12"/>
      <ellipse cx="346" cy="226" rx="45" ry="64" fill="#ead0c8" stroke="#6c5a50" stroke-width="12"/>
      <g fill="#fff7e9" stroke="#6c5a50" stroke-width="12" stroke-linejoin="round">
        <circle cx="161" cy="166" r="48"/>
        <circle cx="216" cy="128" r="53"/>
        <circle cx="282" cy="128" r="53"/>
        <circle cx="340" cy="166" r="49"/>
        <circle cx="364" cy="235" r="57"/>
        <circle cx="324" cy="306" r="66"/>
        <circle cx="251" cy="326" r="74"/>
        <circle cx="178" cy="300" r="61"/>
        <circle cx="137" cy="232" r="53"/>
      </g>
      <path d="M179 202c0-72 154-72 154 0v78c0 58-32 94-77 94s-77-36-77-94z" fill="#f6ddcf" stroke="#6c5a50" stroke-width="12" stroke-linejoin="round"/>
      <path d="M164 352c47 38 138 38 184 0l27 47c-67 45-177 45-238 0z" fill="#087f83" stroke="#065d60" stroke-width="11" stroke-linejoin="round"/>
      <path d="M296 375l67 77 16-82z" fill="#0c999e" stroke="#065d60" stroke-width="10" stroke-linejoin="round"/>
      ${face(state)}
      <circle cx="190" cy="284" r="18" fill="#dc6f7e" opacity=".42"/>
      <circle cx="322" cy="284" r="18" fill="#dc6f7e" opacity=".42"/>
    </g>
    ${props(pose)}
  </g>
</svg>`;
}

function poseState(pose) {
  if (["despair", "cry"].includes(pose)) return "sad";
  if (pose === "surprise") return "surprise";
  if (pose === "sleep") return "sleep";
  if (pose === "confused") return "confused";
  if (["celebrate", "smile", "cheer", "thankful"].includes(pose)) return "happy";
  if (["praying", "worship", "kneel"].includes(pose)) return "closed";
  return "soft";
}

function face(state) {
  if (state === "sad") {
    return `<path d="M207 247q23-20 44 0" fill="none" stroke="#312723" stroke-width="11" stroke-linecap="round"/>
      <path d="M263 247q23-20 44 0" fill="none" stroke="#312723" stroke-width="11" stroke-linecap="round"/>
      <path d="M229 321q27-26 54 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M327 269c20 25 19 43 0 51-20-8-20-26 0-51z" fill="#79c8e0" stroke="#4fa7c3" stroke-width="5"/>`;
  }
  if (state === "surprise") {
    return `<circle cx="222" cy="252" r="15" fill="#312723"/>
      <circle cx="290" cy="252" r="15" fill="#312723"/>
      <ellipse cx="256" cy="313" rx="18" ry="25" fill="#8b2f48"/>`;
  }
  if (state === "sleep") {
    return `<path d="M206 254q25 17 49 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M263 254q25 17 49 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M232 312q24 10 48 0" fill="none" stroke="#312723" stroke-width="9" stroke-linecap="round"/>
      <text x="347" y="128" fill="#087f83" font-family="Arial, sans-serif" font-size="38" font-weight="700">Zz</text>`;
  }
  if (state === "confused") {
    return `<path d="M207 247q21-12 42 6" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M263 253q22-18 44-6" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M236 316q20 8 41 0" fill="none" stroke="#312723" stroke-width="9" stroke-linecap="round"/>
      <text x="342" y="157" fill="#b07a23" font-family="Arial, sans-serif" font-size="52" font-weight="700">?</text>`;
  }
  if (state === "happy") {
    return `<path d="M207 249q23 20 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M260 249q23 20 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M219 304q37 44 76 0" fill="none" stroke="#312723" stroke-width="11" stroke-linecap="round"/>`;
  }
  if (state === "closed") {
    return `<path d="M207 250q23 17 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M260 250q23 17 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
      <path d="M232 309q25 18 50 0" fill="none" stroke="#312723" stroke-width="9" stroke-linecap="round"/>`;
  }
  return `<path d="M207 249q23 18 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
    <path d="M260 249q23 18 45 0" fill="none" stroke="#312723" stroke-width="10" stroke-linecap="round"/>
    <path d="M228 305q28 25 56 0" fill="none" stroke="#312723" stroke-width="9" stroke-linecap="round"/>`;
}

function arms(pose) {
  const stroke = `fill="none" stroke="#6c5a50" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"`;
  const teal = `fill="none" stroke="#087f83" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"`;
  if (pose === "wave") return `<path d="M155 332c-49-23-65-59-43-87" ${stroke}/><path d="M108 239l-30-22" ${stroke}/><path d="M108 239l-38 5" ${stroke}/><path d="M358 335c42-17 58-41 53-72" ${stroke}/>`;
  if (pose === "pray" || pose === "kneel") return `<path d="M212 365c28-41 59-41 87 0" ${stroke}/><path d="M235 352v68" ${teal}/><path d="M278 352v68" ${teal}/>`;
  if (pose === "worship") return `<path d="M160 325c-58-40-73-88-38-124" ${stroke}/><path d="M351 325c58-40 73-88 38-124" ${stroke}/>`;
  if (pose === "hug" || pose === "comfort") return `<path d="M152 336c42 27 80 30 111 8" ${stroke}/><path d="M360 336c-42 27-80 30-111 8" ${stroke}/>`;
  if (pose === "point") return `<path d="M154 338c-22-69 4-124 73-159" ${stroke}/><path d="M221 178l7-37" ${stroke}/><path d="M360 337c35-12 51-34 47-66" ${stroke}/>`;
  if (pose === "run") return `<path d="M150 334c-48-11-75-35-81-70" ${stroke}/><path d="M360 330c52 7 82 29 90 66" ${stroke}/>`;
  if (pose === "walk") return `<path d="M150 336c-39-17-58-43-58-76" ${stroke}/><path d="M360 338c38 15 56 40 53 74" ${stroke}/>`;
  return `<path d="M153 335c-42-16-61-41-59-76" ${stroke}/><path d="M359 335c42-16 61-41 59-76" ${stroke}/>`;
}

function legs(pose) {
  const stroke = `fill="none" stroke="#6c5a50" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"`;
  if (pose === "kneel") return `<path d="M212 404c-35 14-58 36-70 67" ${stroke}/><path d="M300 404c35 14 58 36 70 67" ${stroke}/>`;
  if (pose === "run") return `<path d="M220 405l-63 58" ${stroke}/><path d="M292 405l82 35" ${stroke}/>`;
  if (pose === "walk") return `<path d="M220 405l-45 54" ${stroke}/><path d="M292 405l41 54" ${stroke}/>`;
  return `<path d="M219 405l-22 61" ${stroke}/><path d="M293 405l22 61" ${stroke}/>`;
}

function props(pose) {
  if (pose === "book" || pose === "carryBook") return `<g fill="#fffdfb" stroke="#6c5a50" stroke-width="10" stroke-linejoin="round"><path d="M130 345c52-22 91-12 126 20v80c-37-31-76-40-126-20z"/><path d="M256 365c35-32 74-42 126-20v80c-50-20-89-11-126 20z"/><path d="M256 365v80"/></g>`;
  if (pose === "teach") return `<g><rect x="313" y="145" width="134" height="90" rx="10" fill="#fffdfb" stroke="#6c5a50" stroke-width="9"/><path d="M333 177h92M333 203h66" stroke="#087f83" stroke-width="9" stroke-linecap="round"/></g>`;
  if (pose === "write") return `<g><rect x="131" y="374" width="249" height="73" rx="10" fill="#fffdfb" stroke="#6c5a50" stroke-width="9"/><path d="M184 409h92M185 431h54" stroke="#087f83" stroke-width="8" stroke-linecap="round"/><path d="M319 346l48 48" stroke="#b07a23" stroke-width="12" stroke-linecap="round"/></g>`;
  if (pose === "tea") return `<g><path d="M324 376h66v46c0 26-66 26-66 0z" fill="#fffdfb" stroke="#6c5a50" stroke-width="9"/><path d="M389 389c31-5 31 33 0 29" fill="none" stroke="#6c5a50" stroke-width="9"/><path d="M339 359c-8-18 12-22 4-40M366 359c-8-18 12-22 4-40" stroke="#b07a23" stroke-width="7" stroke-linecap="round"/></g>`;
  if (pose === "umbrella") return `<g><path d="M114 168c48-92 229-92 277 0z" fill="#dff3f1" stroke="#6c5a50" stroke-width="10"/><path d="M252 169v184" stroke="#6c5a50" stroke-width="10" stroke-linecap="round"/><path d="M252 353c0 43 50 43 50 0" fill="none" stroke="#6c5a50" stroke-width="10" stroke-linecap="round"/></g>`;
  if (pose === "lantern") return `<g><path d="M373 286v96" stroke="#6c5a50" stroke-width="9" stroke-linecap="round"/><rect x="343" y="377" width="61" height="75" rx="14" fill="#fff4c5" stroke="#6c5a50" stroke-width="9"/><path d="M357 377c8-34 42-34 50 0" fill="none" stroke="#6c5a50" stroke-width="8"/></g>`;
  if (pose === "heart") return `<path d="M364 324c-31-32-91 6-45 59l45 43 45-43c47-53-13-91-45-59z" fill="#8b2f48" stroke="#6c5a50" stroke-width="9" stroke-linejoin="round"/>`;
  if (pose === "listen") return `<g><path d="M356 176c31 19 47 47 46 85" fill="none" stroke="#087f83" stroke-width="10" stroke-linecap="round"/><path d="M383 151c47 31 69 74 66 129" fill="none" stroke="#087f83" stroke-width="10" stroke-linecap="round"/></g>`;
  if (pose === "cheer") return `<g><path d="M363 260v142" stroke="#6c5a50" stroke-width="9" stroke-linecap="round"/><path d="M363 266l80 25-80 31z" fill="#f7c85c" stroke="#6c5a50" stroke-width="8" stroke-linejoin="round"/></g>`;
  if (pose === "thankful") return `<g fill="#f7c85c" stroke="#8a6820" stroke-width="5" stroke-linejoin="round"><path d="M365 311l10 22 22 10-22 10-10 22-10-22-22-10 22-10z"/><path d="M119 172l7 15 15 7-15 7-7 15-7-15-15-7 15-7z"/></g>`;
  return "";
}

function decorations(pose) {
  if (pose === "calm") return `<path d="M112 118c45 20 90 14 132-19" fill="none" stroke="#087f83" stroke-width="8" stroke-linecap="round" opacity=".55"/>`;
  if (pose === "despair") return `<g><path d="M88 94c14-33 66-27 69 10 35-5 50 43 14 57H91c-41-9-36-65-3-67z" fill="#d7dde0" stroke="#6c5a50" stroke-width="8" stroke-linejoin="round"/><path d="M105 182v32M142 181v38M176 180v30" stroke="#79c8e0" stroke-width="8" stroke-linecap="round"/></g>`;
  if (pose === "pray" || pose === "kneel") return `<g fill="none" stroke="#b07a23" stroke-width="8" stroke-linecap="round"><path d="M256 76v67"/><path d="M226 105h60"/></g>`;
  if (pose === "worship") return `<g fill="none" stroke="#b07a23" stroke-width="8" stroke-linecap="round"><path d="M91 149q18-30 44-45"/><path d="M421 149q-18-30-44-45"/><path d="M382 79v52"/><path d="M382 79q37 7 37 31"/></g>`;
  if (pose === "wave") return `<g fill="none" stroke="#087f83" stroke-width="8" stroke-linecap="round"><path d="M54 170q-29-25-10-56"/><path d="M79 153q-17-19-6-39"/></g>`;
  if (pose === "walk") return `<g fill="none" stroke="#b07a23" stroke-width="7" stroke-linecap="round" opacity=".8"><path d="M77 399h55"/><path d="M99 425h42"/></g>`;
  if (pose === "run") return `<g fill="none" stroke="#b07a23" stroke-width="8" stroke-linecap="round"><path d="M52 304h80"/><path d="M31 344h87"/><path d="M58 384h57"/></g>`;
  if (["celebrate", "cheer"].includes(pose)) return `<g fill="none" stroke="#b07a23" stroke-width="9" stroke-linecap="round"><path d="M83 92l31 20"/><path d="M417 93l-31 22"/><path d="M439 219l44 3"/><path d="M74 220l-43 11"/></g>`;
  if (pose === "hope") return `<path d="M401 94l15 34 34 15-34 15-15 34-15-34-34-15 34-15z" fill="#f7c85c" stroke="#8a6820" stroke-width="7" stroke-linejoin="round"/>`;
  if (pose === "think") return `<g fill="#fffdfb" stroke="#6c5a50" stroke-width="8"><circle cx="363" cy="137" r="19"/><circle cx="401" cy="102" r="31"/></g>`;
  if (pose === "heart" || pose === "hug" || pose === "comfort") return `<g fill="#8b2f48" opacity=".22"><circle cx="101" cy="116" r="14"/><circle cx="126" cy="116" r="14"/><path d="M88 124q25 33 51 0z"/></g>`;
  if (pose === "smile") return `<g fill="none" stroke="#f7c85c" stroke-width="8" stroke-linecap="round"><path d="M96 105l-25-26"/><path d="M416 105l25-26"/><path d="M256 58V22"/></g>`;
  return "";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
