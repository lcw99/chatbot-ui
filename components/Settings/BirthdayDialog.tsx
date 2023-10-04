import { FC, useContext, useEffect, useReducer, useRef } from 'react';

import { useTranslation } from 'next-i18next';

import { useCreateReducer } from '@/hooks/useCreateReducer';

import HomeContext from '@/pages/api/home/home.context';

import DateTimePicker from 'react-datetime-picker';
import 'react-datetime-picker/dist/DateTimePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import { getBirthday, saveBirthday } from '@/utils/app/birthday';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const getDateTimeString = (d: Date, includeTime: boolean): string  => {
  let str = d.getFullYear() + ("0"+(d.getMonth()+1)).slice(-2) + ("0" + d.getDate()).slice(-2);
  if (includeTime)
    str += ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2);
  return str;
}

export const BirthdayDialog: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation('settings');
  const birthday: Date = getBirthday();
  const { state, dispatch } = useCreateReducer<Date>({
    initialState: birthday,
  });
  const { dispatch: homeDispatch } = useContext(HomeContext);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        window.addEventListener('mouseup', handleMouseUp);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      window.removeEventListener('mouseup', handleMouseUp);
      onClose();
    };

    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  var newBirthday: Date = new Date();
  const today = getDateTimeString(newBirthday, false);
  const handleSave = async () => {
    const birthdayStr = getDateTimeString(newBirthday, true);
    const response = await fetch("https://fortune.stargio.co.kr:8445/stargioSaju/1.0.0/get.sajuText", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "birthday": birthdayStr, "today": today, "sex": "male" }),
    });
    var saju = "";
    if (response.ok) {
      saju = JSON.parse(await response.text());
    }
    console.log(saju);
    saveBirthday(newBirthday, saju);
  };

  const onDateChange = (value: any) => {
    newBirthday = value;
  };

  // Render nothing if the dialog is not open.
  if (!open) {
    return <></>;
  }

  // Render the dialog.
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="fixed inset-0 z-10 overflow-hidden">
        <div className="flex items-center justify-center max-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="hidden sm:inline-block sm:h-screen sm:align-middle"
            aria-hidden="true"
          />

          <div
            ref={modalRef}
            className="dark:border-netural-400 inline-block max-h-[400px] transform overflow-y-auto rounded-lg border border-gray-300 bg-white px-4 pt-5 pb-4 text-left align-bottom shadow-xl transition-all dark:bg-[#202123] sm:my-8 sm:max-h-[600px] sm:w-full sm:max-w-lg sm:p-6 sm:align-middle"
            role="dialog"
          >
            <div className="text-lg pb-4 font-bold text-black dark:text-neutral-200">
              {t('Settings')}
            </div>

            <div className="text-sm font-bold mb-2 text-black dark:text-neutral-200">
              {"생년월일시"}
            </div>

            <div>
              <DateTimePicker onChange={onDateChange} value={birthday} format="yyyy/MM/dd HH:mm" disableCalendar={true} disableClock={true}/>
            </div>

            <button
              type="button"
              className="w-full px-4 py-2 mt-6 border rounded-lg shadow border-neutral-500 text-neutral-900 hover:bg-neutral-100 focus:outline-none dark:border-neutral-800 dark:border-opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-300"
              onClick={() => {
                handleSave();
                onClose();
              }}
            >
              {t('Save')}
            </button>
            
          </div>
        </div>
      </div>
    </div>
  );
};
