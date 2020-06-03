
<script>
import { setContext } from 'svelte';

//Components
 import Navbar from './Navbar.svelte';
 import ExpensesList from './ExpensesList.svelte';
 import Totals from './Totals.svelte';
 import ExpenseForm from './ExpenseForm.svelte';
 //Data
 import expensesData from './expenses.js';
//Variables
 let expenses = [...expensesData];
 //reactive
 $: total = expenses.reduce((ac, curr) => {
     return (ac += curr.amount);
 }, 0)
 //Functions
 const removeExpense= (id) => {
     expenses = expenses.filter(item => item.id !== id);
 }
 const  clearExpenses = () => {
     expenses = [];
 }
 const addExpense = ({name, amount}) => {
     let expense = {id: Math.random() * Date.now(),
     name, amount};
     expenses = [expense, ...expenses];
 }
 //Context  
 setContext('remove', removeExpense)

</script>
 

<Navbar/>
<main class="content">
<ExpenseForm {addExpense}/>
<Totals title="Total expenses" {total}/>
<ExpensesList {expenses} />
<button type="button" class="btn btn-primary btn-block" on:click={clearExpenses}>Clear expenses</button>
</main>
