import dayjs, { Dayjs } from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";


export type Time = string | Date | number | Dayjs


export const isInPast = (time: Time) => dayjs(time).isBefore(dayjs());
