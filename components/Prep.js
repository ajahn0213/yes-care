import { T } from '@/lib/copy';

export const PREP = [
  ['01', '나의 삶을 돌아보세요.', '요즘 나의 마음은 어떤 상태인가요? 하나님과의 관계는 어떠한가요? 특별히 감사한 일이나 마음에 남아 있는 고민이 있나요?'],
  ['02', '함께 나누고 싶은 이야기를 생각해 보세요.', '믿음의 질문, 진로와 관계의 고민, 삶의 변화, 기도 제목 등 어떤 이야기든 괜찮습니다. 모든 질문에 답을 준비할 필요도 없습니다.'],
  ['03', '기도로 준비해 보세요.', '이 만남이 단순한 대화에 머물지 않고, 하나님께서 우리의 삶을 새롭게 하시는 시간이 되도록 함께 기도하며 준비해 주세요.'],
];

export default function Prep() {
  return (
    <section className="prep" aria-labelledby="prep-h">
      <h2 id="prep-h">{T.prepTitle}</h2>
      <p>만나기 전, 편한 때에 잠깐 마음을 살펴보세요.</p>
      <ol>
        {PREP.map(([n, h, t]) => <li key={n}><span className="n" aria-hidden="true">{n}</span><div><b>{h}</b><span>{t}</span></div></li>)}
      </ol>
      <p className="close">{T.prepClose}</p>
    </section>
  );
}
