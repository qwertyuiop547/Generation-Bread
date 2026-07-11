declare interface IFlavorList {
  name: string;
  image: string;
  bgColor: string;
  rotation: string;
}

declare interface INutrientList {
  label: string;
  amount: string;
}

declare interface ICard {
  src: string;
  rotation: string;
  name: string;
  img: string;
  translation?: string;
}
