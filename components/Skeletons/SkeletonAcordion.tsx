import React from 'react'
import ContentLoader from 'react-content-loader'


const SkeletonAcordion = (props: any) => {

    const height = props.height || 130;
    const width = props.width || 400;
    
    return (
        <ContentLoader
            viewBox={`0 0 ${width} ${height}`}
            backgroundColor="hsl(var(--b1))"
            foregroundColor="hsl(var(--b3))"
            {...props}
            width="100%"
        >
        <rect x="0" y="0" rx="3" ry="3" width="100%" height="10" />
        <rect x="20" y="20" rx="3" ry="3" width="50%" height="10" />
        <rect x="20" y="40" rx="3" ry="3" width="30%" height="10" />
        <rect x="0" y="60" rx="3" ry="3" width="100%" height="10" />
        <rect x="20" y="80" rx="3" ry="3" width="50%" height="10" />
        <rect x="20" y="100" rx="3" ry="3" width="25%" height="10" />
        </ContentLoader>
    )
}

export default SkeletonAcordion