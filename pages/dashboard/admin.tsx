import { forwardRef } from "react";
import DashboardLayout from "../../components/Dashboard/DashboardLayout";
import PageTransition from "../../components/PageTransition";
import { User, Order, Enrollment, Course } from "../../payload-types";
import { GetServerSidePropsContext } from "next";
import { useAuth } from "../../components/Auth";
import { IndexPageRef, PaginatedDocs } from "../../utils/types/common";
import Line from "../../components/Charts/Line";
import axios, { AxiosResponse } from "axios";
import tryCatch from "../../utils/tryCatch";
import dayjs from "dayjs";
import Pie from "../../components/Charts/Pie";
import Bar from "../../components/Charts/Bar";
import { apiUrl } from "../../utils/env";

type AdminPageProps = {
    users: User[]
    orders: Order[]
    enrollments: Enrollment[]
}

function AdminPage(props: AdminPageProps, ref: IndexPageRef) {

    const { users, orders, enrollments } = props;
    const { user } = useAuth()
    // const router = useRouter();

    
    const userByDate = users.map(user => dayjs(user.createdAt).format('DD/MM/YYYY'))
   const userByDateCount = userByDate.reduce((acc: Record<string, number>, date: string) => {
        acc[date] = acc[date] + 1 || 1
        return acc
    }, {})
const seriesDataAndCategories = Object.entries(userByDateCount).reduce((acc: { categories: string[], seriesData: number[] }, [key, value]) => { 
        acc.categories.push(key)
        acc.seriesData.push(value)
        return acc
    }, { categories: [], seriesData: [] })

    const ordersByProduct = orders.map(order => order.products && order.products.map(product => (product as any).name)).flat()
    const ordersByProductCount = ordersByProduct.reduce((acc, product) => {
        acc[product] = acc[product] + 1 || 1
        return acc
    }, {})
    const seriesDataAndCategoriesOrders = Object.entries(ordersByProductCount).reduce((acc, [key, value]) => {
        acc.categories.push(key)
        acc.seriesData.push(value)
        return acc
    }, { categories: [] as string[], seriesData: [] as unknown[] })
    const enrollmentsByCourse = enrollments.map(enrollment => enrollment.course && (enrollment.course as Course).name)
    const enrollmentsByCourseCount = enrollmentsByCourse.reduce((acc: { [key: string]: number }, course) => {

        if (!course) return acc

        acc[course] = acc[course] + 1 || 1
        return acc
    }, {})

    const seriesDataAndCategoriesenrollmentss = Object.entries(enrollmentsByCourseCount).reduce((acc, [key, value]) => {
        acc.categories.push(key)
        acc.seriesData.push(value)
        return acc
    }, { categories: [] as string[], seriesData: [] as unknown[] })


    if (!user?.roles?.includes('admin')) {
        // router.push('/dashboard')
        
    }

    return (
        <PageTransition ref={ref}>
            <DashboardLayout>
            <h1 className="text-5xl font-bold py-4">Bienvenido al panel de administración</h1>
            <h2 className="text-2xl font-bold mb-6">Estadísticas</h2>
                <Line
                    seriesName="Usuarios registrados"
                    seriesData={seriesDataAndCategories.seriesData}
                    categories={seriesDataAndCategories.categories}
                    title="Usuarios registrados"
                />
            <h4 className="text-xl font-bold mb-6">Productos más vendidos</h4>
                <Pie
                    labels={seriesDataAndCategoriesOrders.categories}
                    seriesData={seriesDataAndCategoriesOrders.seriesData}
                />
            <div className="flex w-full justify-between">
            </div>
            <h4 className="text-xl font-bold mb-6">Cursos con más matriculaciones</h4>
            <Bar 
                seriesData={seriesDataAndCategoriesenrollmentss.seriesData}
                categories={seriesDataAndCategoriesenrollmentss.categories}
            />
            </DashboardLayout>
        </PageTransition>
    )
}

export default forwardRef(AdminPage);

export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {

    // check if user is logged in
    const user = req.cookies['payload-token']

    // decode user

    const [users, errorUser] = await tryCatch<AxiosResponse<PaginatedDocs<User>>>(axios.get(
        apiUrl + '/api/users?sort=-createdAt&limit=1000',
        {
            withCredentials: true,
            headers: {
            Authorization: `JWT ${req.cookies['payload-token']}`,
            },
        },
    ))

    if (errorUser) {
        console.log(errorUser);
    }

    const [orders, errorOrders] = await tryCatch<AxiosResponse<PaginatedDocs<Order>>>(axios.get(
        apiUrl + '/api/orders?sort=-createdAt&limit=1000',
        {
            withCredentials: true,
            headers: {
            Authorization: `JWT ${req.cookies['payload-token']}`,
            },
        },
    ))

    if (errorOrders) {
        console.log(errorOrders);
    }

    const [enrollments, errorenrollments] = await tryCatch<AxiosResponse<PaginatedDocs<Enrollment>>>(axios.get(
        apiUrl + '/api/enrollments?sort=-createdAt&limit=1000',
        {
            withCredentials: true,
            headers: {
            Authorization: `JWT ${req.cookies['payload-token']}`,
            },
        }
    ))

    if (errorenrollments) {
        console.log(errorenrollments);
    }

    if (!user || !users || !orders || !enrollments) {
        return {
            redirect: {
                destination: '/login',
                permanent: false,
            },
        };
    }

    return {
        props: {
            users: users ? users.data.docs : null,
            orders: orders ? orders.data.docs : null,
            enrollments: enrollments ? enrollments.data.docs : null,
        }, // will be passed to the page component as props
    };
}
