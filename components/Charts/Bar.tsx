import dynamic from 'next/dynamic';
import { useState } from 'react';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type BarProps = {
  seriesData: any[];
  categories: string[];
};

const Bar = ({ seriesData, categories }: BarProps) => {
  const [series, setSeries] = useState([
    {
      data: seriesData,
    },
  ]);

  return (
    <div id="chart-Bar">
      <Chart
        options={{
          chart: {
            width: 380,
            type: 'bar',
          },
          plotOptions: {
            bar: {
              borderRadius: 4,
              horizontal: true,
            },
          },
          dataLabels: {
            enabled: false,
          },
          xaxis: {
            categories: categories,
          },
          responsive: [
            {
              breakpoint: 480,
              options: {
                chart: {
                  width: 200,
                },
              },
            },
          ],
        }}
        series={series}
        type="bar"
        height={350}
      />
    </div>
  );
};

export default Bar;
