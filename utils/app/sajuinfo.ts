import { Saju } from '@/types/saju';

const STORAGE_KEY_SAJU = 'saju';

export const getDateTimeString = (d: Date, includeTime: boolean): string  => {
  let str = d.getFullYear() + ("0"+(d.getMonth()+1)).slice(-2) + ("0" + d.getDate()).slice(-2);
  if (includeTime)
    str += ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2);
  return str;
}

export const fetchSaju = async (birthday: Date, today: Date, sex: string): Promise<string> => {
  const birthdayStr = getDateTimeString(birthday, true);
  const todayStr = getDateTimeString(today, false);

  const response = await fetch("https://fortune.stargio.co.kr:8445/stargioSaju/1.0.0/get.sajuText", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ "birthday": birthdayStr, "today": todayStr, "sex": sex }),
  });
  var sajuStr = "";
  if (response.ok) {
    sajuStr = JSON.parse(await response.text());
  }
  return sajuStr;
}

export const getSaju = (): Saju => {
  let saju: Saju = {birthday: new Date(), sex: "male", saju: "", today: new Date()};
  const sajuString = localStorage.getItem(STORAGE_KEY_SAJU);
  if (sajuString) {
    try {
      let sajuObj = JSON.parse(sajuString);
      sajuObj.birthday = new Date(Date.parse(sajuObj.birthday));
      sajuObj.today = new Date(Date.parse(sajuObj.today));
      saju = Object.assign(saju, sajuObj);
    } catch (e) {
      console.error(e);
    }
  }

  return saju;
};

export const saveSaju = (saju: Saju) => {
  saju.today = new Date();
  console.log("saju----" + saju.birthday);
  console.log(saju);
  localStorage.setItem(STORAGE_KEY_SAJU, JSON.stringify(saju));
};

export const refreshSaju = async (): Promise<Saju> => {
  const saju = getSaju();
  if (saju.saju == "")
    return saju;
  const now = new Date();
  const nowStr = getDateTimeString(now, false);
  const todayStrInSaju = getDateTimeString(saju.today, false);
  if (nowStr == todayStrInSaju)
    return saju;
  saju.saju = await fetchSaju(saju.birthday, now, saju.sex);
  saveSaju(saju);
  return saju;
}
