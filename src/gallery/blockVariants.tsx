import {
  BitsSheet,
  ButtonSheet,
  ColourSheet,
  DialogSheet,
  FormSheet,
  HeaderSheet,
  PanelSheet,
  TypeSheet,
} from "./blockSheets";
import { rows, type Variant } from "./variant";

export const BLOCK_VARIANTS: Variant[] = rows(
  {
    group: "Building blocks",
    section: "Shared parts",
    stage: "sheet",
    view: () => null,
  },
  [
    {
      id: "block-buttons",
      title: "HudButton: every variant, size and state",
      view: () => <ButtonSheet />,
    },
    {
      id: "block-panels",
      title: "Panel, PanelHeader, Section and table",
      view: () => <PanelSheet />,
    },
    {
      id: "block-dialogs",
      title: "DialogShell",
      view: () => <DialogSheet />,
    },
    {
      id: "block-bits",
      title: "Chip, Notice, Stat and the small parts",
      view: () => <BitsSheet />,
    },
    {
      id: "block-forms",
      title: "Fields, checkboxes, choices and tabs",
      view: () => <FormSheet />,
    },
    {
      id: "block-header",
      title: "PageHeader",
      view: () => <HeaderSheet />,
    },
    {
      id: "block-type",
      title: "Type scale",
      view: () => <TypeSheet />,
    },
    {
      id: "block-colours",
      title: "Colours and spacing",
      view: () => <ColourSheet />,
    },
  ]
);
