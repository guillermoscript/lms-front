import React from 'react';
import useCountdown from './hooks/useCountdown';
import ExpiredNotice from './ExpiredNotice';
import ShowCounter from './ShowCounter';

type CountdownTimerProps = {
  targetDate: number;
  children?: React.ReactNode;
};

export default function CountdownTimer({ targetDate, children }: CountdownTimerProps) {
  const [days, hours, minutes, seconds] = useCountdown(targetDate);

  if (days + hours + minutes + seconds <= 0) {
    return <ExpiredNotice />;
  } else {
    return (
      <>
        <ShowCounter days={days} hours={hours} minutes={minutes} seconds={seconds} />
        {children}
      </>
    );
  }
}
