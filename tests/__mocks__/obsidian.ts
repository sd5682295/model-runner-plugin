export class Plugin {
  app: any;
  manifest: any;
  
  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  
  async loadData() { return {}; }
  async saveData(data: any) {}
  addRibbonIcon() { return {} as any; }
  addStatusBarItem() { return {} as any; }
  registerView() {}
  addCommand() {}
}

export class PluginSettingTab {
  constructor(app: any, plugin: any) {}
  display() {}
}

export class Modal {
  constructor(app: any) {}
  open() {}
  close() 
  onOpen() {}
  onClose() {}
}

export class Notice {
  constructor(message: string) {}
}

export class Setting {
  constructor(containerEl: HTMLElement) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
}

export class ItemView {
  containerEl: any = {};
  getViewType() { return ''; }
  getDisplayText() { return ''; }
  onOpen() {}
  onClose() {}
}
