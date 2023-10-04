const STORAGE_KEY_BIRTHDAY = 'birthday';
const STORAGE_KEY_SAJU = 'saju';

export const getBirthday = (): Date => {
  let birthday: Date = new Date();
  const birthdayISOString = localStorage.getItem(STORAGE_KEY_BIRTHDAY);
  if (birthdayISOString) {
    try {
      let savedBirthday = new Date(Date.parse(birthdayISOString));
      birthday = savedBirthday;
    } catch (e) {
      console.error(e);
    }
  }
  return birthday;
};

export const getSaju = (): string => {
  return localStorage.getItem(STORAGE_KEY_SAJU) ?? "";
};

export const saveBirthday = (birthday: Date, saju: string) => {
  localStorage.setItem(STORAGE_KEY_BIRTHDAY, birthday.toISOString());
  localStorage.setItem(STORAGE_KEY_SAJU, saju);
};
