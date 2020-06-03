
<script>
import { setContext, onMount } from 'svelte';

//Components
 import Navbar from './Navbar.svelte';
 import ExpensesList from './ExpensesList.svelte';
 import Totals from './Totals.svelte';
 import ExpenseForm from './ExpenseForm.svelte';
 //Data
//  import expensesData from './expenses.js';
//Variables
 let expenses = [];
 //set editing variables
 let setName = '';
 let setAmount = null;
 let setId = null;
 //Toggle form variables
 let isFormOpen = false;
 //reactive
 $: isEditing = setId? true: false;
 $: total = expenses.reduce((ac, curr) => {
     return (ac += curr.amount);
 }, 0)
 //Functions
 const showForm = () => {
     isFormOpen = true;
 }
 const hideForm = () => {
     isFormOpen = false;
     setName = '';
     setAmount = null;
     setId = null;
 }
 const removeExpense= (id) => {
     expenses = expenses.filter(item => item.id !== id);
     setLocalStorage();
 }
 const  clearExpenses = () => {
     expenses = [];
     setLocalStorage();

 }
 const addExpense = ({name, amount}) => {
     let expense = {id: Math.random() * Date.now(),
     name, amount};
     expenses = [expense, ...expenses];
     setLocalStorage();

 }
 const setModifiedExpense = (id) => {
     
      let expense = expenses.find(item => item.id === id);
      setId = expense.id;
      setName = expense.name;
      setAmount = expense.amount;
      showForm();
 }
 const editExpense = ({name, amount}) => {
  expenses = expenses.map(item => {
      return item.id === setId? {...item, name, amount} : {...item}
  });
  setId = null;
  setAmount= null;
  setName = '';
  setLocalStorage();

     
 }
 //Context  
 setContext('remove', removeExpense);
 setContext('modify', setModifiedExpense);
 //Local storage
 const setLocalStorage =() => {
     localStorage.setItem('expenses',JSON.stringify( expenses));
 }

onMount(() => {
   expenses = localStorage.getItem('expenses')
   ? JSON.parse(localStorage.getItem('expenses'))
   
   :[];
});
</script>
 

<Navbar {showForm} />
<main class="content">
{#if isFormOpen}
<ExpenseForm
 {addExpense}
 name={setName} 
 amount={setAmount}
 {isEditing} 
 {editExpense}
 {hideForm}/>
{/if}
<Totals title="Total expenses" {total}/>
<ExpensesList {expenses} />
<button type="button" class="btn btn-primary btn-block" on:click={clearExpenses}>Clear expenses</button>
</main>
