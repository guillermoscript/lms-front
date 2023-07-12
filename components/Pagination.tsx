import { PaginatedDocs } from "../utils/types/common";

type PaginationProps = Omit<PaginatedDocs<any>, "docs"> & {
    onClick: (page: number) => void;
};

export default function Pagination({
    limit,
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    prevPage,
    nextPage,
    onClick
}: PaginationProps) {


    const middle = Math.ceil(totalPages / 2);

    return (
        <div className="btn-group">
            {
                hasPrevPage && (
                    <button
                        onClick={ () => onClick(page - 1)}
                    className="btn">Prev</button>
                )
            }
            {
                hasNextPage && (
                    <button
                        onClick={ () => onClick(page + 1)}
                    className="btn">Next</button>
                )
            }
            {
                totalPages >= 5 ? (
                    <>
                    {/* {
                        (page) > 1 && (
                            <button
                                onClick={ () =>  onClick(1)}
                            className="btn">1</button>
                        )
                    } */}
                    {hasPrevPage && (
                        <>
                        {
                            page >= middle && (
                                <>
                                    <button
                                        onClick={ () => onClick(page - 2)}
                                    className="btn">{page - 2}</button>
                                    <button
                                        disabled
                                    className="btn btn-disabled">...</button>
                                </>
                            )
                        }
                        <button
                            onClick={ () => onClick(page - 1)}
                            className="btn">{prevPage}</button>
                        </>
                    )}
                        <button
                            disabled
                            className="btn">{page}</button>

                    {
                        hasNextPage && (
                            <>
                            <button
                                onClick={ () => onClick(nextPage)}
                                className="btn">{nextPage}</button>
                                {page < middle && (
                                    <>
                                        <button
                                            onClick={ () => onClick(page + 2)}
                                            className="btn">{page + 2}</button>
                                        <button
                                            disabled
                                            className="btn btn-disabled">...</button>
                                    </>
                                )}
                            </>
                                
                        )
                    }
                    {
                        (page + 1) < totalPages && (
                            <button
                                onClick={ () => onClick(totalPages)}
                            className="btn">{totalPages}</button>
                        )
                    }
                    </>
                ) : (
                <button
                    disabled
                    className="btn btn-active">{page}</button>
                )
            }
        </div>
    )
}