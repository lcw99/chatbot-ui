import { Saju } from '@/types/saju';

const STORAGE_KEY_SAJU = 'saju';

export const getSaju = (): Saju => {
  let saju: Saju = {birthday: new Date(), sex: "male", saju: ""};
  const sajuString = localStorage.getItem(STORAGE_KEY_SAJU);
  if (sajuString) {
    try {
      let sajuObj = JSON.parse(sajuString);
      sajuObj.birthday = new Date(Date.parse(sajuObj.birthday));
      saju = Object.assign(saju, sajuObj);
    } catch (e) {
      console.error(e);
    }
  }

  return saju;
};

export const saveSaju = (saju: Saju) => {
  console.log(saju);
  localStorage.setItem(STORAGE_KEY_SAJU, JSON.stringify(saju));
};
