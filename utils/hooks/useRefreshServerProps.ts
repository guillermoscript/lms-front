import { useRouter } from "next/router";

export default function useRefreshServerProps() {
    const router = useRouter();
	// Call this function whenever you want to
	// refresh props!
	const refreshData = () => {
		router.replace(router.asPath);
	};

    return { refreshData };
}
