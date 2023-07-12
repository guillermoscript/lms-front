import dayjs from "dayjs";

export type CommentReplyUserDataProps = {
  avatar: string;
  name: string;
  date: string;
};

export default function CommentReplyUserData({ avatar, name, date }: CommentReplyUserDataProps) {

    const dateFormatted = dayjs(date).format("YYYY/MM/DD HH:mm");
    console.log(avatar)

  return (
    <footer className="flex justify-between items-center mb-2">
      <div className="flex items-center">
        <p className="inline-flex items-center mr-3 text-sm ">
          <img className="mr-2 w-6 h-6 rounded-full" src={avatar} alt={`${name} avatar`} />
          {name}
        </p>
        <p className="text-sm ">
          <time title={date}>{dateFormatted}</time>
        </p>
      </div>
      <button
        id="dropdownComment4Button"
        data-dropdown-toggle="dropdownComment4"
        className="inline-flex items-center p-2 text-sm font-medium text-center  rounded-lg  focus:ring-4 focus:outline-none "
        type="button"
      >
        <svg
          className="w-5 h-5"
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"></path>
        </svg>
      </button>
      <div id="dropdownComment4" className="hidden z-10 w-36  rounded divide-y  shadow ">
        <ul
          className="py-1 text-sm text-gray-700 dark:text-gray-200"
          aria-labelledby="dropdownMenuIconHorizontalButton"
        >
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
              Edit
            </a>
          </li>
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
              Remove
            </a>
          </li>
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
              Report
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
