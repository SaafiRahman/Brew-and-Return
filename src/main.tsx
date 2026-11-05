import { render } from 'preact';
import { Controller } from './app/controller';
import { App } from './ui/App';
import './styles.css';

const ctl = new Controller();
render(<App ctl={ctl} />, document.getElementById('app')!);
void ctl.start();
