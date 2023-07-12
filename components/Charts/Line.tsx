import dynamic from 'next/dynamic';
import { useState } from 'react';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type LineProps = {
  seriesName: string;
  seriesData: any[];
  title: string;
  categories: string[];
};

const Line = ({ seriesName, seriesData, title, categories }: LineProps) => {
  const [series, setSeries] = useState([
    {
      name: seriesName,
      data: seriesData,
    },
  ]);

  return (
    <div id="chart-line">
      <Chart
        options={{
          chart: {
            height: 350,
            type: 'line',
            zoom: {
              enabled: false,
            },
          },
          dataLabels: {
            enabled: false,
          },
          stroke: {
            curve: 'straight',
          },
          title: {
            text: title,
            align: 'left',
          },
          grid: {
            row: {
              colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
              opacity: 0.5,
            },
          },
          xaxis: {
            categories: categories,
          },
        }}
        series={series}
        type="line"
        height={350}
      />
    </div>
  );
};

export default Line;
