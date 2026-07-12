import card01Gwang from '$lib/assets/hwatu/01-gwang.png';
import card01 from '$lib/assets/hwatu/01.png';
import card02 from '$lib/assets/hwatu/02.png';
import card03Gwang from '$lib/assets/hwatu/03-gwang.png';
import card03 from '$lib/assets/hwatu/03.png';
import card04 from '$lib/assets/hwatu/04.png';
import card05 from '$lib/assets/hwatu/05.png';
import card06 from '$lib/assets/hwatu/06.png';
import card07 from '$lib/assets/hwatu/07.png';
import card08Gwang from '$lib/assets/hwatu/08-gwang.png';
import card08 from '$lib/assets/hwatu/08.png';
import card09 from '$lib/assets/hwatu/09.png';
import card10 from '$lib/assets/hwatu/10.png';

export const HWATU_CARD_IMAGES: Record<string, string> = {
  '01-gwang': card01Gwang,
  '01': card01,
  '02': card02,
  '03-gwang': card03Gwang,
  '03': card03,
  '04': card04,
  '05': card05,
  '06': card06,
  '07': card07,
  '08-gwang': card08Gwang,
  '08': card08,
  '09': card09,
  '10': card10
};

export const HWATU_CARD_URLS = Object.values(HWATU_CARD_IMAGES);
