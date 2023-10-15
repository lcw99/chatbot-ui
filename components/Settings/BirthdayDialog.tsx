import { FC, useContext, useEffect, useReducer, useRef } from 'react';

import { useTranslation } from 'next-i18next';

import { useCreateReducer } from '@/hooks/useCreateReducer';

import HomeContext from '@/pages/api/home/home.context';

import DateTimePicker from 'react-datetime-picker';
import 'react-datetime-picker/dist/DateTimePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import { fetchSaju, getSaju, saveSaju, getDateTimeString } from '@/utils/app/sajuinfo';
import { Saju } from '@/types/saju';

import { fetchOpenAI } from '@/pages/api/chat';
import { ChatBody, Message } from '@/types/chat';

interface Props {
  open: boolean;
  onClose: () => void;
}


export const BirthdayDialog: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation('settings');
  const saju: Saju = getSaju();
  const { state, dispatch } = useCreateReducer<Saju>({
    initialState: saju,
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

  var sajuCanceled = false;
  const handleSave = async () => {
    // console.log("saju.birthday=" + saju.birthday + ", type=" + typeof(saju.birthday));
    if (sajuCanceled) {
      saju.saju = "";
      saju.sex = state.sex;
      saju.active = false;
      saveSaju(saju);
      homeDispatch({ field: 'refresh', value: true }); // just home refresh
      return;
    }
    
    let sajuStr = "";

    saju.birthday = state.birthday;
    saju.sex = state.sex;
    saju.active = true;
    if (state.birthday.getFullYear() >= 1900) {
      sajuStr = await fetchSaju(state.birthday, new Date(), state.sex);
      saju.saju = sajuStr;
      if (false) {
        saveSaju(saju);
        
        const ss = sajuStr.split("###");
        ss.splice(3, 1);
        const sajuStrTemp = ss.join("###"); 
        console.log("sajuStrTemp=" + sajuStrTemp);
        let message: Message = {role: "user", content: sajuStrTemp + "\n위 내용을 요약하라."};
        let messagesToSend: Message[] = [message];
        const res = await fetchOpenAI("", messagesToSend, 200, "", "", false);
        const json = await res.json();
        let summary = "";
        if (json['choices'].length > 0)
          summary = json['choices'][0]['message']['content'];
        let newSummary = summary;
        if (summary.length > 200) {
          newSummary = "";
          const ss = summary.split("\n");
          ss.forEach(function (item, index) {
            if ((newSummary + item).length > 400 || index >= 2)
              return;
            newSummary += item + "\n";
            console.log("newSummary=" + index + ":" + newSummary);
          });
        }
        sajuStr = "\n\n### 사주요약\n" + newSummary + "\n" + sajuStr;
      }
    }

    console.log("******" + sajuStr.substring(0, 100));

    saju.saju = sajuStr;
    saveSaju(saju);
    homeDispatch({ field: 'refresh', value: true }); // just home refresh
  };

  const onDateChange = (value: any) => {
    dispatch({ field: 'birthday', value: value })
    saju.birthday = value as Date;
  };

  const onCheckChange = (value: any) => {
    sajuCanceled = value;
    saju.active = false;
    saveSaju(saju);
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
              {t('Birthday')}
            </div>

            <div className='text-lg text-black dark:text-white'>
              <DateTimePicker onChange={onDateChange} value={state.birthday} format="yyyy/MM/dd HH:mm" disableCalendar={true} disableClock={true}/>
            </div>

            <select
              className="w-full cursor-pointer bg-transparent p-2 text-lg dark:text-lg  text-black dark:text-white"
              value={state.sex}
              onChange={(event) => {
                  dispatch({ field: 'sex', value: event.target.value })
                  saju.sex = state.sex;
                }
              }
            >
              <option className='dark:text-black' value="male">{t('Male')}</option>
              <option className='dark:text-black' value="female">{t('Female')}</option>
            </select>
            <label className='text-lg text-black dark:text-white'>
              <input
                type="checkbox"
                onChange={(event) => onCheckChange(event.target.checked)}
              />
              &nbsp; {t('Delete Birthday')}
            </label>
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
