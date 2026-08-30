FACILITY OPS v0.3.0 - GitHub Pages + Supabase 멀티유저

[이번 버전]
- 여러 PC/직원이 하나의 공용 시설 DB 사용
- 이메일/비밀번호 로그인
- 등록/수정 사용자 ID 자동 저장
- 실시간 변경 감지 및 자동 새로고침
- 기존 v0.2 JSON 백업을 공용 DB로 가져오기
- viewer 계정은 조회 전용
- GitHub Pages 정적 배포용 index.html 포함

[설정 순서]
1. Supabase 프로젝트를 만듭니다.
2. Supabase > SQL Editor에서 supabase_schema.sql 전체를 실행합니다.
3. Authentication > Users에서 사용할 직원 계정을 생성합니다.
4. Supabase Project URL과 Publishable Key(sb_publishable_...)를 확인합니다.
5. config.js의 YOUR_PROJECT_URL / YOUR_PUBLISHABLE_KEY를 바꿉니다.
   * Secret Key / service_role 키는 절대로 넣지 마세요.
6. 이 폴더의 파일들을 GitHub 저장소 루트에 업로드합니다.
7. GitHub 저장소 > Settings > Pages > Deploy from a branch > main / root 로 설정합니다.
8. 발급된 github.io 주소에 접속하여 로그인합니다.

[기존 v0.2 데이터 이전]
- 기존 v0.2에서 '데이터 내보내기'로 JSON 백업
- v0.3 로그인 후 '백업 데이터 가져오기'로 해당 JSON 선택
- 시설 -> 점검 -> 고장/민원 -> 일정 순서로 공용 DB에 업로드됩니다.

[권한]
- member: 조회/등록/수정/삭제
- admin: 현재 v0.3에서는 member와 동일, 이후 관리자 기능 확장 예정
- viewer: 조회만 가능
- 역할 변경은 Supabase SQL Editor에서 profiles.role을 변경합니다.

[중요]
- Publishable Key는 프론트엔드용 키이며 RLS 정책과 함께 사용합니다.
- Secret Key/service_role은 RLS를 우회하므로 GitHub/HTML/config.js에 절대로 넣지 마세요.
- 회사 내부 정책상 외부 Supabase/GitHub Pages 접속이 차단되어 있으면 별도 사내 호스팅이 필요합니다.
