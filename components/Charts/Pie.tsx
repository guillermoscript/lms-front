import dynamic from 'next/dynamic';
import { useState } from 'react';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

type PieProps = {
  seriesData: any[];
  labels: string[];
};

const Pie = ({ seriesData, labels }: PieProps) => {
  const [series, setSeries] = useState(seriesData);

  return (
    <div id="chart-Pie">
      <Chart
        options={{
          chart: {
            width: 380,
            type: 'pie',
          },
          labels: labels,
          responsive: [
            {
              breakpoint: 480,
              options: {
                chart: {
                  width: 200,
                },
                legend: {
                  position: 'bottom',
                },
              },
            },
          ],
        }}
        series={series}
        type="pie"
        height={350}
      />
    </div>
  );
};

export default Pie;
