/**
 * IndexNow 설정. 키는 공개 값이다(사이트 루트 /<키>.txt 로 누구나 읽게 둬야 검색엔진이 소유를 확인한다) — 비밀이 아니다.
 * 키 파일 public/<키>.txt 의 내용은 키 한 줄(개행 없음)이어야 한다.
 * indexnow.mjs · sitemap-diff.mjs 는 이 파일과 node 기본 모듈만 import 한다(CI 에서 가볍게).
 */
export const INDEXNOW_KEY = '3fe389a4c8bcd4ffe8bbea03cdb0f4e4';
export const HOST = 'marathon82.com';
export const SITE_ORIGIN = `https://${HOST}`;
export const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
/** 두 곳에 각각 보낸다 */
export const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'];
/** 한 번에 보낼 수 있는 최대 주소 수 (IndexNow 규격 10,000) */
export const MAX_URLS = 10000;
