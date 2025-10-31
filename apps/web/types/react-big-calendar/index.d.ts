declare module 'react-big-calendar/lib/TimeGrid' {
  import { ComponentType } from 'react';
  import { TimeGridProps } from 'react-big-calendar';

  interface CustomTimeGridProps extends TimeGridProps {
    date?: Date;
  }

  const TimeGrid: ComponentType<CustomTimeGridProps>;
  export default TimeGrid;
}
