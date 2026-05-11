const FOOTER_LINKS = [
  { key: "terms", label: "이용약관" },
  { key: "privacy", label: "개인정보처리방침" },
  { key: "shipping", label: "배송 환불 적립금 안내" },
];

const PANEL_CONTENT = {
  shipping: {
    title: "배송 환불 적립금 안내",
    body: `
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">배송 안내</h3>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">가. 배송 정보</p>
          <ul class="site-policy__list">
            <li>배송 방법 : 택배 배송 (전국 지역)</li>
            <li>배송 기간 : 3일 ~ 7일</li>
            <li>배송 비용 : 기본 3,500원 / 10만 원 이상 구매 시 무료</li>
          </ul>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">나. 발송 일정</p>
          <ul class="site-policy__list">
            <li>재고 상품: 이미 제작이 완료된 상품은 주문 확인 후 영업일 기준 2일 이내 발송됩니다.</li>
            <li>주문 제작(Order-made) 상품: 주문 후 제작이 시작되는 작품은 영업일 기준 최대 7일 이내 발송됩니다. 정성을 다해 만드는 시간이니 조금만 기다려 주세요!</li>
          </ul>
        </div>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">교환, 반품, 환불 안내</h3>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">가. 교환 및 반품 주소</p>
          <p class="site-policy__body">(03971) 서울특별시 마포구 월드컵로 110, 2층 202호 / 전화: 010-4746-5999</p>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">나. 교환 및 반품이 가능한 경우</p>
          <ul class="site-policy__list">
            <li>상품을 받으신 날로부터 7일 이내.</li>
            <li>내용이 표시, 광고 내용과 다르거나 계약 내용과 다르게 이행된 때에는 당해 재화 등을 공급받은 날부터 3개월 이내, 그 사실을 알게 된 날 또는 알 수 있었던 날부터 30일 이내.</li>
          </ul>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">다. 교환 및 반품이 불가능한 경우</p>
          <ul class="site-policy__list">
            <li>이용자에게 책임 있는 사유로 상품이 훼손된 경우.</li>
            <li>이용자의 사용 또는 일부 소비에 의하여 가치가 현저히 감소한 경우.</li>
            <li>시간 경과에 의하여 재판매가 곤란할 정도로 가치가 현저히 감소한 경우.</li>
            <li>개별 주문 생산(Order-made)되는 경우.</li>
          </ul>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">라. 환불 및 배송비 안내</p>
          <ul class="site-policy__list">
            <li>환불 배송비 : 단순 변심에 의한 교환/반품 시 왕복 배송비(6,000원)는 고객님 부담입니다. (제품 하자로 인한 교환/반품은 오알룸에서 배송비를 부담합니다.)</li>
            <li>반품 여부를 확인한 후 3영업일 이내에 결제 금액을 환불해 드립니다.</li>
            <li>신용카드로 결제한 경우 신용카드 승인을 취소하여 대금이 청구되지 않게 합니다. (단, 결제일자에 따라 대금이 청구될 수 있으며, 이 경우 익월 카드사에서 환급 처리됩니다.)</li>
          </ul>
        </div>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">확인해 주세요 (핸드메이드 유의사항)</h3>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">가. 제품의 특성</p>
          <ul class="site-policy__list">
            <li>핸드메이드 공정 특성상 발생하는 미세한 형태나 자수 패턴의 차이는 제품의 하자가 아닙니다. 상세 이미지를 꼭 확인하신 후 신중한 구매 부탁드립니다.</li>
          </ul>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">나. 추가 반품 불가 사유</p>
          <ul class="site-policy__list">
            <li>사용 흔적(오염, 향수, 세탁 등)으로 상품 가치가 훼손된 경우.</li>
            <li>구성품(사은품, 전용 파우치 등)이 분실되거나 파손된 경우.</li>
            <li>고객 요청으로 사양을 변경한 1:1 맞춤 제작 상품인 경우.</li>
          </ul>
        </div>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">적립금 이용 및 소멸 안내</h3>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">가. 적립금 이용</p>
          <ul class="site-policy__list">
            <li>적립금은 1,000포인트 이상부터 자유롭게 사용할 수 있습니다.</li>
            <li>적립금 사용 시 최대 구매 가능 적립금은 한도 제한이 없습니다.</li>
            <li>주문으로 발생한 적립금은 배송 완료 시점에 지급됩니다.</li>
          </ul>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">나. 적립금 취소 및 소멸</p>
          <ul class="site-policy__list">
            <li>주문 취소 및 환불 시에 상품 구매로 적립된 적립금은 함께 취소됩니다.</li>
            <li>회원 탈퇴 시 적립금은 자동으로 소멸됩니다.</li>
          </ul>
        </div>
      </section>
    `,
  },
  privacy: {
    title: "개인정보처리방침 (스튜디오 오알룸)",
    body: `
      <section class="site-policy__section">
        <p class="site-policy__body">스튜디오 오알룸(이하 ‘회사’)는 고객의 개인정보를 중요하게 여기며, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 및 관련 법령을 준수하고 있습니다.
회사는 개인정보처리방침을 통해 고객이 제공하는 개인정보가 어떤 용도와 방식으로 이용되며, 개인정보 보호를 위해 어떤 조치가 이루어지고 있는지 알려드립니다.</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 수집하는 개인정보 항목 및 수집 방법</h3>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">가. 수집하는 개인정보 항목</p>
          <p class="site-policy__body">회사는 회원가입, 상담, 서비스 신청 등을 위해 아래와 같은 개인정보를 수집합니다.
(서비스 이용 과정에서 아래 정보들이 자동으로 생성되어 수집될 수 있습니다: 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP, 결제 기록, 불량 이용 기록)
회원 가입 시: 아이디, 비밀번호, 휴대전화, 이메일, 14세 이상 여부
서비스 이용 및 주문 시: 이름, 휴대전화, 주소, 결제 정보, 배송 정보</p>
        </div>
        <div class="site-policy__section-block">
          <p class="site-policy__subheading">나. 수집 방법</p>
          <p class="site-policy__body">웹사이트, 서면 양식, 게시판, 이메일, 이벤트 응모, 배송 요청, 전화 등을 통해 수집됩니다.</p>
        </div>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보의 수집 및 이용 목적</h3>
        <p class="site-policy__body">회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.
서비스 제공 및 계약 이행
상품 구매 및 결제, 배송, 고객 응대
회원 관리
본인 확인, 개인 식별, 부정 이용 방지, 가입 의사 확인, 연령 확인, 민원 처리
마케팅 및 광고 활용
이벤트 안내, 서비스 개선을 위한 통계 분석
(※ 마케팅 정보 수신은 별도 동의 시에만 진행됩니다)</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보 보유 및 이용 기간</h3>
        <p class="site-policy__body">개인정보는 수집 및 이용 목적 달성 후 지체 없이 파기합니다.
단, 아래의 경우 일정 기간 보관합니다.
가. 내부 방침에 따른 보관
부정 이용 방지 및 분쟁 대응: 3년
나. 관련 법령에 따른 보관
계약 또는 청약철회 기록: 5년
대금 결제 및 재화 공급 기록: 5년
소비자 불만 및 분쟁 처리 기록: 3년
접속 로그 기록: 3개월</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보의 파기 절차 및 방법</h3>
        <p class="site-policy__body">파기 절차
목적 달성 후 별도 DB로 이동 후 일정 기간 보관 후 파기
파기 방법
전자 파일은 복구 불가능한 방식으로 삭제</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보의 제3자 제공</h3>
        <p class="site-policy__body">회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.
다만 아래의 경우는 예외로 합니다.
이용자가 사전에 동의한 경우
법령에 따른 요청이 있는 경우</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보 처리 위탁</h3>
        <p class="site-policy__body">회사는 서비스 제공을 위해 필요한 경우 아래와 같이 개인정보 처리를 위탁할 수 있습니다.
결제 서비스 제공업체 (예: 토스페이먼츠 등)
배송 서비스 제공업체 (택배사 등)
호스팅 및 서버 운영 업체
※ 위탁 내용은 서비스 운영 상황에 따라 변경될 수 있습니다.</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 이용자의 권리 및 행사 방법</h3>
        <p class="site-policy__body">이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제 요청할 수 있습니다.
회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.
개인정보 관련 문의는 이메일을 통해 요청할 수 있으며 지체 없이 처리됩니다.</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 쿠키(cookie) 운영 안내</h3>
        <p class="site-policy__body">회사는 이용자 맞춤 서비스를 위해 쿠키를 사용합니다.
사용 목적
접속 빈도 분석, 이용 형태 파악, 맞춤 서비스 제공
설정 방법
이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있습니다.
(단, 일부 서비스 이용에 제한이 있을 수 있습니다)</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보 보호 책임자</h3>
        <p class="site-policy__body">회사는 개인정보 보호를 위해 아래와 같이 책임자를 지정하고 있습니다.
책임자: (여기에 이름 넣기)
이메일: (여기에 이메일)</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 개인정보 관련 문의</h3>
        <p class="site-policy__body">개인정보 관련 문의 및 신고는 아래 기관을 통해 가능합니다.
개인정보침해신고센터 (privacy.kisa.or.kr / 118)
개인정보분쟁조정위원회 (kopico.go.kr / 1833-6972)
경찰청 사이버범죄 신고 (182)</p>
      </section>
      <section class="site-policy__section">
        <h3 class="site-policy__section-title">■ 시행일</h3>
        <p class="site-policy__body">본 개인정보처리방침은 2026년 5월 1일부터 시행됩니다.</p>
      </section>
    `,
  },
  terms: {
    title: "이용약관",
    body: `
      <section class="site-policy__section">
        <p class="site-policy__subheading">제1조(목적)</p>
        <p class="site-policy__body">이 약관은 스튜디오 오알룸(전자상거래 사업자)가 운영하는 스튜디오 오알룸 웹사이트(https://www.studiooalum.com, 이하 ‘스튜디오 오알룸’)에서 제공하는 서비스(이하 ‘서비스’) 이용에 따른 스튜디오 오알룸과 이용자의 권리, 의무 및 책임을 규정하는 것을 목적으로 합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제2조(정의)</p>
        <p class="site-policy__body">① ‘스튜디오 오알룸’이란 스튜디오 오알룸이 재화 또는 용역(이하 ‘재화 등’)을 이용자에게 제공하기 위하여 컴퓨터 등 정보통신 설비를 이용하여 재화 등을 거래할 수 있도록 설정한 가상의 영업장을 말하며, 아울러 스튜디오 오알룸을 운영하는 사업자의 의미로도 사용합니다.
② ‘이용자’란 ‘스튜디오 오알룸’에 접속하여 이 약관에 따라 ‘스튜디오 오알룸’이 제공하는 서비스를 받는 회원 및 비회원을 말합니다.
③ ‘회원’은 ‘스튜디오 오알룸’에 회원 등록을 한 자로서, 계속적으로 ‘스튜디오 오알룸’이 제공하는 서비스를 이용할 수 있는 자를 말합니다.
④ ‘비회원’은 회원에 가입하지 않고 ‘스튜디오 오알룸’이 제공하는 서비스를 이용하는 자를 말합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제3조(약관 등의 명시와 설명 및 개정)</p>
        <p class="site-policy__body">① ‘스튜디오 오알룸’은 이 약관의 내용과 상호 및 대표자 성명, 영업소 소재지 주소(소비자 불만을 처리하는 곳의 주소 포함), 전화번호, 전자우편, 사업자등록번호, 통신판매업 신고번호, 개인정보관리자 등을 이용자가 쉽게 알 수 있도록 스튜디오 오알룸의 초기 화면에 게시합니다. 다만, 약관의 내용은 이용자가 링크를 통하여 보도록 할 수 있습니다.
② ‘스튜디오 오알룸’은 이용자가 약관에 동의하기에 앞서 약관에 정하는 내용 중 청약 철회, 배송 책임, 환불 조건 등과 같은 중요한 내용을 이용자가 이해할 수 있도록 제공하여 이용자의 확인을 구하여야 합니다.
③ ‘스튜디오 오알룸’은 관련 법을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.
④ ‘스튜디오 오알룸’이 약관을 개정할 경우에는 적용 일자 및 개정 사유를 명시하여 초기 화면에 공지합니다.
⑤ 개정 약관은 적용일자 이후 체결되는 계약부터 적용됩니다.
⑥ 본 약관에 정하지 않은 사항은 관련 법령 및 상관례에 따릅니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제4조(서비스의 제공 및 변경)</p>
        <p class="site-policy__body">① ‘스튜디오 오알룸’은 다음과 같은 업무를 수행합니다.
재화 또는 용역에 대한 정보 제공 및 구매 계약 체결
구매 계약이 체결된 재화 또는 용역의 배송
기타 ‘스튜디오 오알룸’이 정하는 업무
② 품절 또는 사양 변경 시 제공 내용이 변경될 수 있습니다.
③ 변경 시 이용자에게 통지합니다.
④ 손해 발생 시 배상합니다(고의·과실 없는 경우 제외).</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제5조(서비스의 중단)</p>
        <p class="site-policy__body">① 시스템 점검, 장애 등의 경우 서비스 제공을 일시 중단할 수 있습니다.
② 이로 인한 손해는 배상합니다(고의·과실 없는 경우 제외).
③ 서비스 종료 시 이용자에게 통지 및 보상합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제6조(회원 가입)</p>
        <p class="site-policy__body">① 이용자는 약관 동의 후 회원 가입을 신청합니다.
② 허위 정보 등 특정 사유가 없는 한 회원으로 등록됩니다.
③ 가입 시점은 승낙 도달 시입니다.
④ 회원은 정보 변경 시 수정해야 합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제7조(회원 탈퇴 및 자격 상실)</p>
        <p class="site-policy__body">① 회원은 언제든 탈퇴할 수 있습니다.
② 약관 위반 시 자격 제한·정지 가능합니다.
③ 반복 위반 시 자격 상실됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제8조(회원에 대한 통지)</p>
        <p class="site-policy__body">① 이메일 등으로 통지합니다.
② 공지는 게시판 게시로 대체할 수 있습니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제9조(구매 신청 및 주문 제작 상품의 특성)</p>
        <p class="site-policy__body">① 이용자는 상품 선택 및 결제를 통해 구매를 신청합니다.
② 스튜디오 오알룸의 상품은 수공예 제품으로, 공정 특성상 다음과 같은 차이가 발생할 수 있습니다.
패턴 배치 차이
색감 차이 (모니터 환경 포함)
수작업 특성에 따른 미세한 오차
→ 이는 불량이 아닌 정상 범주로 간주됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제10조(계약의 성립)</p>
        <p class="site-policy__body">결제 완료 시 계약이 성립됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제11조(결제 방법)</p>
        <p class="site-policy__body">카드, 계좌이체, 다양한 결제방식으로 결제할 수 있습니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제12조(주문 변경 및 취소)</p>
        <p class="site-policy__body">① 주문 후 제작 전 단계에서만 취소 가능합니다.
② 다음 경우 취소가 불가합니다.
제작이 이미 시작된 경우
주문 제작 특성상 재판매가 어려운 경우</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제13조(제작 및 배송)</p>
        <p class="site-policy__body">① 제작 기간은 평균 7-10일 소요됩니다.
② 제작 완료 후 순차 배송됩니다.
③ 지연 시 사전 안내합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제14조(환불 및 교환 정책)</p>
        <p class="site-policy__body">① 단순 변심에 의한 교환/환불은 다음 조건에서만 가능합니다.
제작 전 상태
미사용 제품
② 다음 경우 교환/환불이 불가합니다.
주문 제작 상품 (제작 시작 이후)
사용 또는 훼손된 경우
시간 경과로 재판매가 어려운 경우</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제15조(청약 철회 제한 – 주문 제작 상품)</p>
        <p class="site-policy__body">① 스튜디오 오알룸의 상품은 「전자상거래법」에 따라
청약 철회가 제한되는 주문 제작 상품에 해당합니다.
② 따라서 다음 경우 청약 철회가 불가능합니다.
고객 요청에 따라 제작되는 제품
맞춤 제작 또는 패턴 지정 상품
재판매가 어려운 제품
③ 단, 아래 경우는 예외로 합니다.
제품 불량
오배송
표시 내용과 현저히 다른 경우</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제16조(불량 및 오배송 처리)</p>
        <p class="site-policy__body">① 상품 수령 후 3일 이내 접수 시 교환/환불 가능합니다.
② 이 경우 배송비는 스튜디오 오알룸이 부담합니다.
③ 단, 다음은 불량으로 보지 않습니다.
원단 특성 (잡사, 미세 점 등)
수작업 오차
색상 차이</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제17조(환불 처리)</p>
        <p class="site-policy__body">반품 확인 후 3영업일 이내 환불 처리됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제18조(개인정보 보호)</p>
        <p class="site-policy__body">관련 법령에 따라 보호됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제19조(사업자의 의무)</p>
        <p class="site-policy__body">안정적인 서비스 제공 및 정보 보호를 위해 노력합니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제20조(이용자의 의무)</p>
        <p class="site-policy__body">허위 정보 입력 및 부정 행위 금지</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제21조(저작권)</p>
        <p class="site-policy__body">모든 콘텐츠는 스튜디오 오알룸에 귀속됩니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제22조(분쟁 해결)</p>
        <p class="site-policy__body">분쟁 발생 시 협의 및 관련 기관 조정을 따릅니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">제23조(준거법 및 관할)</p>
        <p class="site-policy__body">대한민국 법을 따릅니다.</p>
      </section>
      <section class="site-policy__section">
        <p class="site-policy__subheading">부칙</p>
        <p class="site-policy__body">이 약관은 2026년 5월 1일부터 시행합니다.</p>
      </section>
    `,
  },
};

function getFooterMarkup() {
  const [firstLink, ...restLinks] = FOOTER_LINKS;
  const firstRow = `<button type="button" class="site-footer__link" data-site-policy="${firstLink.key}">${firstLink.label}</button>`;
  const remainingLinks = restLinks.map(
    ({ key, label }) => `<button type="button" class="site-footer__link" data-site-policy="${key}">${label}</button>`,
  ).join("");

  return `
    <div class="site-footer__brand">
      <img class="site-footer__logo-mark" src="./로고.png" alt="Studio OALUM">
    </div>
    <div class="site-footer__text site-footer__text--lead">
      <p>2020년부터 운영해온 수선 스튜디오의 경험을 바탕으로, 만들고 싶은 것을 만듭니다.</p>
      <p>Based on our experience running a repair studio since 2020,
we create whatever we want to make.</p>
    </div>
    <div class="site-footer__text site-footer__text--info">
      <p>스튜디오 오알룸
만드는 사람: 한아름
사업자등록번호 669-24-02313
통신판매업 신고 제2025-서울동대문-2322호</p>
    </div>
    <div class="site-footer__meta-links" aria-label="사이트 정책 링크">
      <div class="site-footer__links-line">${firstRow}</div>
      <div class="site-footer__links">${remainingLinks}</div>
    </div>
    <div class="site-footer__text site-footer__text--contact">
      <p>03971
서울특별시 성산동 252-3 2층 202호
+82-10-4746-5999
studio.oalum@gmail.com</p>
    </div>
    <div class="site-footer__social">
      <a class="site-footer__instagram" href="https://www.instagram.com/studio_oalum/" target="_blank" rel="noreferrer" aria-label="Instagram">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" stroke="currentColor" stroke-width="1.6"></rect>
          <circle cx="12" cy="12" r="4.25" stroke="currentColor" stroke-width="1.6"></circle>
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor"></circle>
        </svg>
      </a>
    </div>
  `;
}

function getPanelMarkup() {
  return `
    <div class="site-policy__backdrop" data-site-policy-close="true"></div>
    <section class="site-policy__panel" role="dialog" aria-modal="true" aria-labelledby="sitePolicyTitle">
      <button type="button" class="site-policy__close" aria-label="안내 닫기" data-site-policy-close="true"></button>
      <div class="site-policy__scroll">
        <h2 class="site-policy__title" id="sitePolicyTitle"></h2>
        <div class="site-policy__content" id="sitePolicyContent"></div>
      </div>
    </section>
  `;
}

let panelEl = null;
let panelTitleEl = null;
let panelContentEl = null;
let activeTrigger = null;

function ensureFooter() {
  const mainEl = document.querySelector("main");
  if (!mainEl) return null;

  let footerEl = document.querySelector(".site-footer");

  if (!footerEl) {
    footerEl = document.createElement("footer");
    footerEl.className = "site-footer site-footer--grid";
    mainEl.appendChild(footerEl);
  }

  footerEl.className = "site-footer site-footer--grid";
  footerEl.innerHTML = getFooterMarkup();
  return footerEl;
}

function ensurePanel() {
  if (panelEl) return;

  panelEl = document.createElement("div");
  panelEl.className = "site-policy";
  panelEl.setAttribute("aria-hidden", "true");
  panelEl.innerHTML = getPanelMarkup();
  document.body.appendChild(panelEl);

  panelTitleEl = panelEl.querySelector("#sitePolicyTitle");
  panelContentEl = panelEl.querySelector("#sitePolicyContent");

  panelEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-site-policy-close]")) {
      closePanel();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!panelEl?.classList.contains("is-open")) return;
    if (event.key === "Escape") closePanel();
  });
}

function openPanel(key, trigger) {
  const panel = PANEL_CONTENT[key];
  if (!panel) return;

  ensurePanel();
  activeTrigger = trigger || null;
  panelTitleEl.textContent = panel.title;
  panelContentEl.innerHTML = panel.body;
  panelEl.classList.add("is-open");
  panelEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("site-policy-open");
  panelEl.querySelector(".site-policy__close")?.focus();
}

function closePanel() {
  if (!panelEl) return;
  panelEl.classList.remove("is-open");
  panelEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("site-policy-open");
  activeTrigger?.focus?.();
}

export function initSiteFooter() {
  const footerEl = ensureFooter();
  if (!footerEl) return;

  ensurePanel();

  footerEl.querySelectorAll("[data-site-policy]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.sitePolicy, button));
  });
}