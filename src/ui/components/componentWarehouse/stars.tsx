const Stars = () => {
  return (
    <div className="flex justify-center items-center w-full absolute top-1.5">
      <div
        className="relative w-5 h-5 bg-no-repeat block"
        style={{ backgroundImage: 'url(/star.svg)' }}
      >
        <div
          className="absolute right-3.5 inline-block w-4 h-4 my-0 mx-0.5 scale-75"
          style={{
            content: '',
            backgroundImage: 'url(/star.svg)',
            backgroundSize: 'contain'
          }}
        ></div>
        <div
          className="absolute left-3.5 inline-block w-4 h-4 my-0 mx-0.5 scale-75"
          style={{
            content: '',
            backgroundImage: 'url(/star.svg)',
            backgroundSize: 'contain'
          }}
        ></div>
      </div>
    </div>
  );
};

export default Stars;
