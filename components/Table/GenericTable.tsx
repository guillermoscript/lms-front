type GenericTableProps = {
  theads: string[];
  children: React.ReactNode;
};

export default function GenericTable({ theads, children }: GenericTableProps) {
  return (
    <div className="overflow-x-auto w-full">
      <table className="table table-zebra w-full">
        {/* head */}
        <thead>
          <tr>
            {theads.map((thead: string, index: number) => (
              <th key={index}>{thead}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* row 1 */}
          {children}
        </tbody>
        {/* foot */}
        <tfoot>
          <tr>
            {theads.map((thead: string, index: number) => (
              <th key={index}>{thead}</th>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
