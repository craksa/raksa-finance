import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:"100vh",background:"#0f0e17",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"monospace",color:"#f25f4c",textAlign:"center"}}>
          <div>
            <div style={{fontSize:18,marginBottom:12}}>App Error</div>
            <div style={{fontSize:13,color:"#a7a9be",maxWidth:400}}>{String(this.state.error)}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
